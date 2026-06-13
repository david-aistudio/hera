# 9router — Deep Architecture Analysis

> **Source**: [github.com/decolua/9router](https://github.com/decolua/9router)
> **Type**: AI API router & token-saver (Next.js + open-sse proxy)
> **License**: Check repo
> **Patterns verified from**: `open-sse/services/combo.js`, `open-sse/services/accountFallback.js`, `open-sse/config/errorConfig.js`

---

## 1. What is 9router?

9router is a **production AI router** that sits between AI coding tools (Claude Code, Cursor, Codex, Cline, etc.) and 40+ AI providers. It is **not** a coding agent — it's a **reverse proxy + key orchestrator**.

Core value props:
- **Save 20-40% tokens** via RTK (Request Token Killer) — compresses tool outputs
- **Multi-account** per provider with round-robin
- **Auto-fallback** Subscription → Cheap → Free
- **Universal** — works with any CLI tool that speaks the OpenAI/Anthropic API
- **Quota tracking** per provider/account/model

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  9router (Next.js dashboard + open-sse proxy)      │
│                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ Dashboard│    │ open-sse     │    │ Database  │ │
│  │ (UI)     │    │ (proxy core) │    │ (SQLite)  │ │
│  └──────────┘    └──────┬───────┘    └───────────┘ │
│                          │                          │
│  ┌───────────────────────▼──────────────────────┐  │
│  │  Executor layer (per-provider)                │  │
│  │  • BaseExecutor + 23 subclasses              │  │
│  │  • openai, anthropic, gemini, codex, ...     │  │
│  └───────────────────────┬──────────────────────┘  │
│                          │                          │
│  ┌───────────────────────▼──────────────────────┐  │
│  │  Combo / Account Fallback / Round-Robin      │  │
│  │  • combo.js — model chains with strategy     │  │
│  │  • accountFallback.js — cooldown + backoff   │  │
│  │  • errorConfig.js — config-driven rules      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  40+ Providers                 CLI tools
  (OpenAI, Anthropic,           (Claude Code,
   Gemini, Codex, ...)           Cursor, Cline, ...)
```

---

## 3. Combo System — Model Chains with Strategy

A **combo** is a list of models that act as a fallback chain. Two strategies:

```js
// From open-sse/services/combo.js
{
  name: "my-combo",
  models: [
    "claude-sonnet-4-5",       // primary
    "gpt-4o",                  // fallback 1
    "gemini-2.5-pro",          // fallback 2
    "ollama-local/llama-3-70b" // free fallback
  ],
  strategy: "fallback",        // or "round-robin"
  stickyLimit: 1               // round-robin: requests per model before switching
}
```

### Fallback Strategy (sequential)

Try model 1 → on error → model 2 → on error → model 3 → ... → fail.

### Round-Robin Strategy (with sticky limit)

Rotate through models. `stickyLimit=N` means **stay on same model for N consecutive requests** before switching. Useful for:
- **Cost distribution**: spread load across subscriptions
- **Rate limit avoidance**: don't hammer one provider
- **Quota maximization**: use all your free tiers

```js
// Internal state (from open-sse/services/combo.js)
const comboRotationState = new Map();
function getRotatedModels(models, comboName, strategy, stickyLimit = 1) {
  // ...
  const nextUseCount = state.consecutiveUseCount + 1;
  if (nextUseCount >= normalizedStickyLimit) {
    comboRotationState.set(rotationKey, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    comboRotationState.set(rotationKey, {
      index: currentIndex,
      consecutiveUseCount: nextUseCount,
    });
  }
  return rotateModelsFromIndex(models, currentIndex);
}
```

---

## 4. Account Fallback & Cooldown

Each account has a `rateLimitedUntil` ISO timestamp. When in cooldown, the key is skipped:

```js
// From open-sse/services/accountFallback.js
function filterAvailableAccounts(accounts, excludeId = null) {
  const now = Date.now();
  return accounts.filter(acc => {
    if (excludeId && acc.id === excludeId) return false;
    if (acc.rateLimitedUntil) {
      const until = new Date(acc.rateLimitedUntil).getTime();
      if (until > now) return false;  // skip — still in cooldown
    }
    return true;
  });
}
```

### State Machine

```
[ACTIVE] ──err──→ [ERRORED, rate_limited_until=now+cooldown]
   ↑                  │
   │                  │ (cooldown expires)
   └──────success─────┘
```

### Per-Model Lock (separate from account-level)

```js
// Model-level lock (granular)
function getModelLockKey(model) {
  return model ? `modelLock_${model}` : `modelLock___all`;
}
function isModelLockActive(connection, model) {
  const key = getModelLockKey(model);
  const expiry = connection[key] || connection[`modelLock___all`];
  return new Date(expiry).getTime() > Date.now();
}
```

Use case: One provider has 5 models, but only model-A is rate-limited. Lock **only that model**, not the whole account.

---

## 5. Exponential Backoff (Config-Driven)

From `open-sse/config/errorConfig.js`:

```js
export const BACKOFF_CONFIG = {
  base: 2000,           // 2s
  max: 5 * 60 * 1000,   // 5 min cap
  maxLevel: 15          // safety bound
};

// Level 1: 2s, Level 2: 4s, Level 3: 8s ... Level 15: capped at 5 min
function getQuotaCooldown(backoffLevel = 0) {
  const level = Math.max(0, backoffLevel - 1);
  return Math.min(BACKOFF_CONFIG.base * Math.pow(2, level), BACKOFF_CONFIG.max);
}
```

**Per-key state**: `backoffLevel` is stored on the account. Resets to 0 on success.

---

## 6. Error Classification Rules

9router uses a **config-driven** approach — order matters, text rules first:

```js
export const ERROR_RULES = [
  // --- Text-based rules (checked first) ---
  { text: "no credentials",            cooldownMs: 2 * 60 * 1000 },
  { text: "request not allowed",       cooldownMs: 5 * 1000 },
  { text: "improperly formed request", cooldownMs: 2 * 60 * 1000 },
  { text: "rate limit",                backoff: true },
  { text: "too many requests",         backoff: true },
  { text: "quota exceeded",            backoff: true },
  { text: "capacity",                  backoff: true },
  { text: "overloaded",                backoff: true },

  // --- Status-based rules ---
  { status: 401, cooldownMs: 2 * 60 * 1000 },
  { status: 403, cooldownMs: 2 * 60 * 1000 },
  { status: 429, backoff: true },
];
```

The matcher (`checkFallbackError`):

```js
function checkFallbackError(status, errorText, backoffLevel = 0) {
  const lowerError = errorText ? errorText.toLowerCase() : "";

  for (const rule of ERROR_RULES) {
    // Text match (case-insensitive)
    if (rule.text && lowerError.includes(rule.text)) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
    }
    // Status match
    if (rule.status === rule.status && rule.status === status) {
      // ... same logic
    }
  }

  // Default: transient cooldown
  return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS };
}
```

**Key insight**: `400` is a **terminal** error (bad request, no point retrying). All other failures → fall back.

---

## 7. Provider Executor Pattern

Each provider has a **subclass** of `BaseExecutor` with 3 hooks:

```js
// From open-sse/executors/base.js
class BaseExecutor {
  buildUrl(model, stream, urlIndex, credentials) { /* ... */ }
  buildHeaders(credentials, stream) { /* ... */ }
  transformRequest(model, body, stream, credentials) { /* ... */ }
}
```

23 providers in `open-sse/executors/`:
- `openai.js`, `azure.js`, `anthropic.js` (via `anthropic-compatible-*`)
- `gemini-cli.js`, `github.js` (Copilot), `codex.js`
- `grok-web.js`, `perplexity-web.js` (web-based, no API key)
- `qoder.js`, `kiro.js`, `iflow.js` (regional)
- `ollama-local.js` (local), `opencode-go.js` (Go-based)
- etc.

**One class per provider** keeps concerns separated. Adding a new provider = new file in this directory.

---

## 8. Format Translation

9router normalizes everything to **OpenAI Chat Completions format** for the client. Internally it translates:

```
[client] → OpenAI Chat Completions → open-sse
                                         ↓
                          ┌──────────────┴──────────────┐
                          ▼                              ▼
                    Anthropic provider            Gemini provider
                    (translate to/from            (translate to/from
                     Messages format)              Gemini format)
```

Source: `open-sse/translator/response/openai-to-claude.js`, etc.

---

## 9. Quota / Usage Tracking

Per-day aggregation, bucketed by multiple dimensions:

```js
// From src/lib/usage/fetcher.js
function aggregateEntryToDay(day, entry) {
  // Buckets:
  day.byProvider ||= {};  // per provider
  day.byModel ||= {};     // per model (with provider prefix)
  day.byAccount ||= {};   // per OAuth account / API key
  day.byApiKey ||= {};    // per actual API key (incl. redacted suffix)
  day.byEndpoint ||= {};  // per endpoint (chat, embedding, image, ...)
}
```

Per-provider usage fetchers (e.g., `getGitHubUsage`, `getGeminiUsage`):

```js
async function getUsageForProvider(connection) {
  const { provider, accessToken } = connection;
  switch (provider) {
    case "github":     return await getGitHubUsage(accessToken, ...);
    case "gemini-cli": return await getGeminiUsage(accessToken);
    case "claude":     return await getClaudeUsage(accessToken);
    case "codex":      return await getCodexUsage(accessToken);
    // ...
  }
}
```

---

## 10. Patterns Hera Can Reuse

| 9router Pattern | Reusable For |
|---|---|
| Combo (model chain + strategy) | Provider fallback template ✅ |
| Round-robin with sticky | Distribute load across API keys ✅ |
| Account-level cooldown (rateLimitedUntil) | Skip rate-limited keys ✅ |
| Per-model lock | Lock only specific models per account |
| Exponential backoff (config-driven) | Self-tuning retry ✅ |
| Error rules (text + status, ordered) | Configurable classification ✅ |
| BaseExecutor + per-provider subclass | Multi-provider agent code |
| Format translation layer | OpenAI ↔ Anthropic ↔ Gemini interop |
| Per-day usage aggregation | Cost/budget guard |
| Recent ring buffer (in-memory) | Live request log |

The Hera template `minimal-provider-fallback.ts` is now inspired by 9router's combo + accountFallback + errorConfig.

---

## 11. Comparison to Other Patterns

| Feature | 9router | Pi Agent | Hermes | OpenCode |
|---|---|---|---|---|
| Multi-key rotation | ✅ | ❌ | ✅ (creds) | ❌ |
| Round-robin with sticky | ✅ | ❌ | ❌ | ❌ |
| Per-model lock | ✅ | ❌ | ❌ | ❌ |
| Config-driven errors | ✅ | ❌ | ❌ | ❌ |
| Format translation | ✅ (extensive) | ❌ | ❌ | ❌ |
| Usage tracking | ✅ (per-day buckets) | ❌ | ✅ (token) | ❌ |
| Token compression (RTK) | ✅ (20-40%) | ❌ | ❌ | ❌ |
| Quota fetching from providers | ✅ (8+ providers) | ❌ | ❌ | ❌ |

9router is **specialized** — it does one thing (routing) very well. Other systems have bits of it, but no other open-source project has all of these patterns in one place.

---

## 12. Verification Checklist

When implementing a similar router:

- [ ] Each key/account has `rateLimitedUntil` field (ISO string)
- [ ] Filter available keys before each request
- [ ] Reset key state on success
- [ ] Apply error state on failure (cooldown + backoffLevel)
- [ ] Round-robin state stored per route (not global)
- [ ] Sticky limit configurable (1 = rotate every call, N = stay for N)
- [ ] Error rules are config-driven (not hardcoded)
- [ ] Text rules checked before status rules
- [ ] 400 is terminal (no fallback)
- [ ] 429 uses exponential backoff
- [ ] Per-model lock is separate from account-level cooldown
- [ ] Reset all states on app restart
