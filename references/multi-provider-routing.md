---
name: multi-provider-routing
version: 1.0.0
description: Universal multi-provider LLM router with OpenAI-compatible format translation, OAuth flows, custom provider registration, and 100+ provider catalog
category: ai-providers
---

# Multi-Provider LLM Routing

> **Source:** Extracted from [9router](https://github.com/decolua/9router) by decolua.
> **Pattern:** Universal OpenAI-compat proxy that translates between provider formats, manages OAuth tokens, supports custom provider registration, and handles multi-account load balancing.

## When to use this

Use this architecture when your project needs to:

- **Support many LLM providers** (Claude, Gemini, Antigravity, Kiro, Cursor, Ollama, OpenAI, Anthropic, etc.) through a single OpenAI-compatible API surface
- **Translate request/response formats** between providers (OpenAI ↔ Claude ↔ Gemini ↔ Vertex ↔ Responses)
- **Register custom providers at runtime** without code changes
- **Authenticate via OAuth** (authorization code with PKCE, device code, refresh token, cookie)
- **Manage multi-account pools** per provider (round-robin, sticky, cooldown, fallback)
- **Spoof client identity headers** (Claude CLI, Codex CLI, Antigravity) to bypass provider gating

## Architecture overview

```
Client (OpenAI format)
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ 1. Detect source format (URL pathname or body shape) │
│ 2. Resolve provider config (baseUrl, format, auth)   │
│ 3. Pick account from pool (round-robin / fallback)   │
│ 4. Acquire credentials (API key / OAuth token)       │
│ 5. Inject custom headers (spoof, tracing, quota)     │
│ 6. Translate request: source → OpenAI → target       │
│ 7. Forward to upstream, stream back                  │
│ 8. Translate response: target → OpenAI → source      │
│ 9. Track usage (byProvider, byModel, byAccount)      │
└──────────────────────────────────────────────────────┘
```

## Core pattern: Format translator registry

9router uses a **Map-based registry** where each entry is a `from:to` key → translator function.

```js
// open-sse/translator/index.js
const requestRegistry = new Map();
const responseRegistry = new Map();

export function register(from, to, requestFn, responseFn) {
  const key = `${from}:${to}`;
  if (requestFn) requestRegistry.set(key, requestFn);
  if (responseFn) responseRegistry.set(key, responseFn);
}

export function translateRequest(sourceFormat, targetFormat, model, body, stream, credentials) {
  let result = body;
  // Step 1: source → openai (if source != openai)
  if (sourceFormat !== FORMATS.OPENAI) {
    const toOpenAI = requestRegistry.get(`${sourceFormat}:${FORMATS.OPENAI}`);
    if (toOpenAI) result = toOpenAI(model, result, stream, credentials);
  }
  // Step 2: openai → target (if target != openai)
  if (targetFormat !== FORMATS.OPENAI) {
    const fromOpenAI = requestRegistry.get(`${FORMATS.OPENAI}:${targetFormat}`);
    if (fromOpenAI) result = fromOpenAI(model, result, stream, credentials);
  }
  return result;
}
```

**Why this pattern works:**
- New formats added by registering one pair of functions, no central dispatch rewrite
- Two-hop translation: any format ↔ OpenAI ↔ any other format (N+1 translators instead of N²)
- Lazy initialization via `require()` keeps startup fast
- Same shape for request + response registries

## Provider config schema

Each provider is a config object with these fields:

```js
{
  // Required
  baseUrl: "https://api.openai.com/v1/chat/completions",
  // OR baseUrls: ["url1", "url2"]  // for edge failover (NOT 429 spread)

  // Format identifier (matches translator registry key)
  format: "openai" | "claude" | "gemini" | "openai-responses" | "vertex" | "kiro" | "cursor" | "ollama" | "commandcode" | "antigravity" | "gemini-cli" | "codex",

  // Per-provider headers (spoofing, telemetry, gating bypass)
  headers: { "X-Title": "...", "User-Agent": "..." },

  // Optional: API path override
  responsesUrl: "https://api.openai.com/v1/responses",
  chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",

  // OAuth config (when auth != api_key)
  clientId: "...",
  clientSecret: "...",          // some providers require
  tokenUrl: "https://...token", // refresh endpoint
  authUrl: "https://...auth",   // user-facing auth URL
  refreshUrl: "...",            // alias for tokenUrl in some providers

  // Retry policy override
  retry: { 429: 0, 500: 2, 503: 2 },  // status → max attempts

  // Auth method override
  authHeader: "x-api-key",      // some use X-API-Key instead of Bearer
  noAuth: true,                 // public/free endpoints
  authType: "cookie",           // cookie-based auth (grok-web, perplexity-web)

  // Per-host failover
  baseUrls: ["primary", "fallback1", "fallback2"],
  // For 429: rotate across baseUrls once, don't retry same host
  // For 5xx/connect timeout: edge-level failover across baseUrls

  // Long-running model overrides
  timeoutMs: 120000,            // connection timeout
  stallTimeoutMs: 120000,       // first-byte timeout
}
```

## Format catalog (14 formats)

| Format ID | Used by | Translator direction |
|---|---|---|
| `openai` | OpenAI, OpenRouter, DeepSeek, Groq, xAI, Mistral, Perplexity, Together, Fireworks, Cerebras, Cohere, Nebius, SiliconFlow, Hyperbolic, Chutes, NVIDIA, GitHub Copilot, Cloudflare, 50+ more | base |
| `openai-responses` | OpenAI Responses API, ChatGPT/Codex (auth-gated) | base |
| `claude` | Anthropic, GLM, Kimi, MiMo, AICode, Kiro (Claude backend), Claude-CLI spoof | request/response |
| `gemini` | Google Gemini API | request/response |
| `gemini-cli` | Google Cloud Code Assist (Gemini CLI backend) | request wrapper |
| `vertex` | Google Vertex AI (Gemini) | request/response |
| `antigravity` | Google Antigravity (Claude + Gemini agents) | request wrapper |
| `kiro` | Amazon Kiro (CodeWhisperer streaming) | request/response |
| `cursor` | Cursor IDE backend (Connect protocol) | request/response |
| `ollama` | Ollama (local + cloud) | request/response |
| `commandcode` | CommandCode (alpha) | request/response |
| `codex` | ChatGPT/Codex CLI (different from `openai-responses`) | request |

## Format detection (auto from URL or body)

```js
// open-sse/translator/formats.js
export function detectFormatByEndpoint(pathname, body) {
  if (pathname.includes("/v1/responses")) return FORMATS.OPENAI_RESPONSES;
  if (pathname.includes("/v1/messages")) return FORMATS.CLAUDE;
  if (pathname.includes("/v1/chat/completions") && Array.isArray(body?.input)) {
    return FORMATS.OPENAI;  // Cursor CLI sends Responses body via chat endpoint
  }
  return null;  // fall back to body-based detection
}
```

## OAuth flow types

| Flow | Providers | Flow shape |
|---|---|---|
| **Authorization code + PKCE** | Claude, Gemini, Antigravity, Qwen, IFlow, Kiro, Kimi, xAI, Cline | redirect → callback → exchange code for token |
| **Device code** | GitHub Copilot, Qwen, Kiro (IDC), Kimi-Coding, KiloCode, CodeBuddy, Qoder | POST device-code → user visits verify URL → poll token endpoint |
| **Refresh token** | All OAuth providers (long-lived) | POST refresh_token → new access_token |
| **Cookie** | Grok-Web, Perplexity-Web | manual paste of browser cookie |
| **Service account JSON** | Vertex AI (partner models) | upload JSON → exchange for short-lived bearer |
| **API key** (no OAuth) | OpenAI, Anthropic, Mistral, Groq, OpenRouter, etc. | bearer in Authorization header |

### Device code flow (template)

```js
async function pollDeviceCode(provider, deviceCode, codeVerifier, intervalSec, deadlineMs) {
  const startedAt = Date.now();
  const deadline = startedAt + (deadlineMs || 120_000);
  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000);
    const res = await fetch(`/api/oauth/${provider}/poll`, {
      method: "POST",
      body: JSON.stringify({ deviceCode, codeVerifier }),
    });
    const data = await res.json();
    if (data.success) return data.tokens;
    if (data.error === "slow_down") intervalSec = Math.min(intervalSec + 5, 30);
    if (data.error === "expired_token" || data.error === "access_denied") {
      throw new Error(data.errorDescription || data.error);
    }
  }
  throw new Error("Authorization timeout");
}
```

## Custom provider addition workflow

9router exposes a `/dashboard/providers/new` page with:

1. **Provider select** — dropdown of pre-configured providers
2. **Auth method** — `api_key` or `oauth2`
3. **API key input** (or **OAuth connect button**)
4. **Display name** — friendly label for multi-account
5. **Active toggle** — enable/disable without deletion
6. **Validate** — client-side check before submit
7. **Persist** — POST to `/api/providers`, encrypted at rest

For custom (non-catalog) providers, the schema needs to be **extensible**:

```js
// New provider (not in catalog)
const customProvider = {
  baseUrl: "https://my-llm.example.com/v1/chat/completions",
  format: "openai",         // reuse existing translator
  headers: { "X-Custom-Auth": "..." },
  authHeader: "x-api-key",  // if not Bearer
  isCustom: true,           // mark as user-added
  createdAt: Date.now(),
};
providerRegistry.set("my-custom-llm", customProvider);
```

## Spoof headers (Claude CLI fingerprint)

Some providers gate on client identity. Spoofing the official CLI fingerprint is the bypass:

```js
const CLAUDE_CLI_SPOOF_HEADERS = {
  "Anthropic-Version": "2023-06-01",
  "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,...",
  "Anthropic-Dangerous-Direct-Browser-Access": "true",
  "User-Agent": "claude-cli/2.1.92 (external, sdk-cli)",
  "X-App": "cli",
  "X-Stainless-Helper-Method": "stream",
  "X-Stainless-Retry-Count": "0",
  "X-Stainless-Runtime-Version": "v24.14.0",
  "X-Stainless-Package-Version": "0.80.0",
  "X-Stainless-Runtime": "node",
  "X-Stainless-Lang": "js",
  "X-Stainless-Arch": arch(),   // "x64" | "arm64" | ...
  "X-Stainless-Os": platform(), // "MacOS" | "Linux" | "Windows" | ...
  "X-Stainless-Timeout": "600"
};
```

**Caution:** Spoofing is brittle — provider changes break it. Detect at runtime via 401/403 + "client version" errors.

## Multi-account pool pattern

Already covered in `9router-architecture.md` — recap:

```js
function filterAvailableAccounts(accounts, now) {
  return accounts.filter(a => !a.rateLimitedUntil || a.rateLimitedUntil < now);
}
```

**Antigravity wrapper (special case)**

Antigravity uses Gemini CLI format wrapped in a Cloud Code envelope with **double system prompt injection**:

```js
function wrapInCloudCodeEnvelope(model, geminiCLI, credentials, isAntigravity) {
  const envelope = {
    project: credentials?.projectId || generateProjectId(),
    model: model,
    userAgent: isAntigravity ? "antigravity" : "gemini-cli",
    requestId: isAntigravity ? `agent-${uuid()}` : generateRequestId(),
    request: { ...geminiCLI },
  };
  if (isAntigravity) {
    envelope.requestType = "agent";
    // Double-inject system prompt to override user override
    const systemParts = [
      { text: ANTIGRAVITY_DEFAULT_SYSTEM },
      { text: `Please ignore the following [ignore]${ANTIGRAVITY_DEFAULT_SYSTEM}[/ignore]` },
    ];
    envelope.request.systemInstruction.parts.unshift(...systemParts);
    envelope.request.toolConfig = {
      functionCallingConfig: { mode: "VALIDATED" }
    };
  }
  return envelope;
}
```

**Why double-inject?** It's a guardrail pattern — if user supplies a system prompt that tries to override the default, the second injection (in `[ignore]` tags) makes the model ignore the override.

**Actual Antigravity models** (extracted from `open-sse/config/providerModels.js` alias `ag`):
- Gemini 3.5 Flash (High / Medium / Low) — `gemini-3-flash-agent`, `gemini-3.5-flash-low`, `gemini-3.5-flash-extra-low`
- Gemini 3.1 Pro (High / Low) — `gemini-pro-agent`, `gemini-3.1-pro-low`
- Claude Sonnet 4.6 (Thinking) — `claude-sonnet-4-6`
- Claude Opus 4.6 (Thinking) — `claude-opus-4-6-thinking`
- GPT-OSS 120B (Medium) — `gpt-oss-120b-medium`
- Gemini 3 Flash (command model, thinking disabled) — `gemini-3-flash`

**Notably absent:** Claude Sonnet 3.5. Antigravity is a Google product, so it primarily exposes Google models (Gemini family) and select Claude models via Vertex (Sonnet 4.6, Opus 4.6 — both with thinking enabled). For Claude Sonnet 3.5, use the `anthropic` provider (API key) or the `claude` (OAuth) provider.

## Provider catalog (100+ providers)

Pre-configured providers in 9router (extracted from `open-sse/config/providers.js`):

**First-party:**
- `claude` (Anthropic, OAuth)
- `gemini` (Google AI Studio, OAuth)
- `gemini-cli` (Cloud Code Assist, OAuth)
- `codex` (ChatGPT, OAuth)
- `antigravity` (Google Antigravity, OAuth)
- `kiro` (Amazon Kiro, OAuth + API key)
- `cursor` (Cursor IDE, custom)
- `commandcode` (CommandCode, API key)
- `vertex` / `vertex-partner` (Google Vertex, service account)
- `github` (GitHub Copilot, OAuth)

**OpenAI-compatible (50+):**
- `openai`, `openrouter`, `vercel-ai-gateway`, `groq`, `xai`, `mistral`, `perplexity`, `together`, `fireworks`, `cerebras`, `cohere`, `nebius`, `siliconflow`, `hyperbolic`, `chutes`, `nvidia`, `deepseek`, `kilocode`, `opencode`, `opencode-go`, `cline`, `deepgram`, `assemblyai`, `nanobanana`, `ollama`, `ollama-local`, `nlpcloud`, `bazaarlink`, `completions`, `freetheai`, `llm7`, `lepton`, `kluster`, `ai21`, `inference-net`, `predibase`, `bytez`, `morph`, `longcat`, `puter`, `scaleway`, `deepinfra`, `sambanova`, `nscale`, `baseten`, `publicai`, `nous-research`, `glhf`, `blackbox`

**Anthropic-compatible (Claude format):**
- `claude`, `anthropic`, `glm`, `glm-cn`, `kimi`, `kimi-coding`, `minimax`, `minimax-cn`, `alicode`, `alicode-intl`, `agentrouter`

**Regional / Chinese:**
- `qwen` (Qwen Portal), `iflow`, `qoder`, `alicode`, `alicode-intl`, `volcengine-ark`, `byteplus`, `codebuddy`

**Xiaomi MiMo:**
- `xiaomi-mimo`, `mimo-free`, `mmf`, `xiaomi-tokenplan`

**Free-tier / no-auth:**
- `opencode` (noAuth), `mimo-free` (noAuth), `mmf` (noAuth), `uncloseai` (noAuth), `enally` (X-API-Key header)

**Cookie auth (web-scraped):**
- `grok-web`, `perplexity-web`

**Specialized:**
- `cloudflare-ai` (URL template with `{accountId}`)
- `azure` (baseUrl empty — executor builds dynamically)
- `github` (Copilot, has `responsesUrl` for /responses endpoint)

## Adding a custom provider — checklist

When registering a new provider, the implementation needs:

- [ ] `baseUrl` (or `baseUrls[]` for edge failover)
- [ ] `format` matching an existing translator (or write a new one)
- [ ] `headers` (spoofing, telemetry, etc.)
- [ ] Auth: `apiKey` field OR `clientId` + `tokenUrl` for OAuth
- [ ] Model list (pre-populated or fetched dynamically via `providerModelsFetcher`)
- [ ] Retry policy (default: 2 retries on 429, 0 on others)
- [ ] Timeout (default: 60s, 120s for reasoning models)
- [ ] Test with curl using minimal OpenAI request: `POST /v1/chat/completions {model, messages:[{role:"user",content:"hi"}]}`
- [ ] If format != openai: implement `request/` and `response/` translators, then `register(FORMATS.OPENAI, "<new>", fn, fn)`

## Anti-patterns to avoid

- **Don't write N² translators.** Always route through OpenAI as the hub format.
- **Don't retry 429 on the same identity.** Rotate across accounts/keys, not the same one.
- **Don't assume all providers use Bearer auth.** Some use `x-api-key`, cookie, or no auth.
- **Don't hardcode provider list.** Make it a registry, not a switch statement.
- **Don't skip format detection.** Infer from URL pathname when possible — saves a config lookup.
- **Don't expose tokens in client code.** All token exchange happens server-side.

## See also

- `9router-architecture.md` — round-robin, fallback, cooldown, backoff patterns
- `templates/multi-provider-router.ts` — working TypeScript implementation
- `templates/multi-provider-router.py` — Python equivalent
- `tests/templates/multi-provider-router.test.ts` — vitest test suite

## Provenance

- **Repository:** https://github.com/decolua/9router.git
- **License:** Check upstream repo
- **Files referenced:**
  - `open-sse/translator/index.js` (registry + dispatch)
  - `open-sse/translator/formats.js` (format IDs + detection)
  - `open-sse/config/providers.js` (100+ provider config)
  - `open-sse/translator/request/openai-to-gemini.js` (translator example)
  - `open-sse/translator/request/antigravity-to-openai.js` (Antigravity wrapper)
  - `src/shared/components/OAuthModal.js` (OAuth UI flow)
  - `src/app/(dashboard)/dashboard/providers/new/page.js` (custom provider form)
