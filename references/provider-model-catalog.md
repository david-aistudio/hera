---
name: provider-model-catalog
version: 1.0.0
description: Comprehensive 9router provider and model catalog — 7 provider categories, 10 service kinds, model metadata, custom model registration, dynamic model fetching
category: ai-provviders
---

# Provider & Model Catalog

> **Source:** Extracted from [9router](https://github.com/decolua/9router) by decolua.
> **Pattern:** Single source of truth for 100+ providers × hundreds of models across 10 service kinds, with custom model registration and live model fetching.

## When to use this

Use this catalog when your project needs to:

- **Manage many AI providers** with a unified registration schema (baseUrl, format, auth, headers, models)
- **Expose a model picker UI** with per-provider model lists
- **Register custom models at runtime** (not in code) — for new model releases, custom deployments, fine-tunes
- **Fetch live model lists** from providers that expose a public models API (OpenAI, Anthropic, Gemini, GitHub Copilot, etc.)
- **Validate model IDs** before sending requests (prevent 400s on unknown models)
- **Handle different service kinds** (chat, embedding, image, tts, stt, web search, web fetch, video, music) in one router

## Provider architecture (7 categories)

9router classifies providers into 7 distinct categories. **Don't conflate them** — each has different auth, validation, and UI behavior.

| Category | Auth | Examples | Notes |
|---|---|---|---|
| **FREE** | OAuth or no-auth | `kiro`, `gemini-cli`, `qoder`, `opencode`, `mimo-free` | Session hijacking / community free tiers; **risk of ban** |
| **FREE_TIER** | API key (free signup) | `openrouter`, `nvidia`, `ollama`, `vertex`, `gemini`, `cloudflare-ai`, `byteplus` | Free credits or rate limits; legitimate |
| **OAUTH** | OAuth (browser flow) | `claude`, `antigravity`, `codex`, `github`, `cursor`, `xai`, `kilocode`, `cline` | User grants account access via OAuth; **risk of ban** |
| **APIKEY** | API key | `openai`, `anthropic`, `deepseek`, `groq`, `mistral`, `glm`, `kimi`, `minimax`, etc. (50+) | Standard pay-as-you-go |
| **WEB_COOKIE** | Browser cookie | `grok-web`, `perplexity-web` | User pastes session cookie |
| **OPENAI_COMPATIBLE_CUSTOM** | API key | `openai-compatible-{userId}` (user-added) | User provides baseUrl + key; OpenAI-format |
| **ANTHROPIC_COMPATIBLE_CUSTOM** | API key | `anthropic-compatible-{userId}` (user-added) | User provides baseUrl + key; Claude-format |

**Anti-pattern:** Don't use OAuth providers as if they were API-key providers. The auth flow, risk profile, and rate limits are fundamentally different.

## Service kinds (10 types)

Each provider declares which kinds it supports. A single provider can serve multiple kinds.

| Kind | Endpoint shape | Examples |
|---|---|---|
| `llm` | `POST /v1/chat/completions` or `/v1/messages` | All major providers |
| `embedding` | `POST /v1/embeddings` | OpenAI, Mistral, Voyage, OpenRouter, Together, Jina, Nebius |
| `image` | `POST /v1/images/generations` | OpenAI (DALL-E, gpt-image), Gemini (Nano Banana), Fal, Stability, BFL, Recraft, Runway |
| `imageToText` | `POST /v1/images/understanding` or `generateContent` | OpenAI, Gemini, Anthropic, xAI, Groq, Mistral, HuggingFace, Deepgram |
| `tts` | `POST /v1/audio/speech` | OpenAI, ElevenLabs, Cartesia, PlayHT, Inworld, Deepgram, Edge TTS, Google TTS, Xiaomi MiMo, Hyperbolic |
| `stt` | `POST /v1/audio/transcriptions` | OpenAI (Whisper), Groq, Deepgram, AssemblyAI, HuggingFace, NVIDIA, Gemini |
| `webSearch` | `POST /search` or `GET /search` | Tavily, Brave, Serper, Exa, SearXNG, Google PSE, Linkup, SearchAPI, You.com |
| `webFetch` | `POST /extract` or `GET /r.jina.ai` | Tavily, Exa, Firecrawl, Jina Reader |
| `video` | `POST /v1/video/generations` | Runway, Topaz |
| `music` | `POST /v1/audio/music` | (none in 9router catalog) |

**Anti-pattern:** Don't hardcode kind routes per provider. Use a config-driven dispatch: each provider's `*Config` declares its endpoint + auth + format.

## Model metadata schema

Each model entry has these fields:

```ts
interface ModelEntry {
  id: string;                              // unique within provider
  name: string;                            // display name
  type?: "llm" | "chat" | "embedding" | "image" | "tts" | "stt" | "video" | "music";
  // Default: "llm" or "chat"
  
  capabilities?: string[];                 // e.g. ["text2img", "edit"], ["chat"]
  params?: string[];                       // supported params (size, quality, language, etc.)
  
  // Format override (for cross-format providers)
  targetFormat?: "openai" | "claude" | "gemini" | "openai-responses" | "openai-response";
  // When set, use this format translator instead of provider default
  // Example: MiMo models use "claude" format even on Xiaomi (OpenAI-format) provider
  
  // Upstream model ID (for aliasing)
  upstreamModelId?: string;
  // When set, send this to the upstream instead of `id`
  // Example: DeepSeek V4 Pro Max → upstream "deepseek-v4-pro"
  
  // Quota family (for OAuth providers with multiple quota buckets)
  quotaFamily?: "normal" | "review";
  // "review" = Codex review models (separate quota)
  
  // Content stripping (for models that don't support images/audio)
  strip?: ("image" | "audio")[];
  // Example: Kiro DeepSeek 3.2 — strip image/audio content from messages
  
  // Thinking override
  thinking?: boolean;                      // false = force disable thinking
}
```

## Custom model addition pattern

**3 ways to add a custom model:**

### 1. Static catalog extension (compile-time)

Add to your `PROVIDER_MODELS` config:

```js
// For an existing provider (e.g. add new OpenAI model)
openai: [
  { id: "gpt-6", name: "GPT-6" },  // pre-emptive, before official release
  { id: "gpt-5.4", name: "GPT-5.4" },
  // ...
]
```

### 2. Runtime registration (user-added)

```js
// User adds a custom model via UI
router.registerModel("openai", {
  id: "ft:gpt-5.4:my-org:custom-model:id",
  name: "My Fine-Tune",
  type: "llm",
  upstreamModelId: "gpt-5.4",  // base model for cost calculation
});

// Now usable:
await router.chat("openai", { model: "ft:gpt-5.4:my-org:custom-model:id", ... });
```

### 3. Dynamic fetch from provider's models API

```ts
// For providers that expose /v1/models (OpenAI-compatible)
async function fetchLiveModels(providerId: string, baseUrl: string, apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || data.models || []).map(m => ({
    id: m.id,
    name: m.name || m.id,
    type: m.id.includes("embed") ? "embedding" : m.id.includes("dall-e") ? "image" : "llm",
  }));
}
```

**Provider-specific endpoints (from 9router):**

| Provider | URL | Method | Auth | Parse |
|---|---|---|---|---|
| `claude` | `https://api.anthropic.com/v1/models` | GET | `x-api-key` | `data.data` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/models` | GET | query `key` | `data.models` |
| `qwen` | `https://portal.qwen.ai/v1/models` | GET | Bearer | `data.data` |
| `codex` | `https://chatgpt.com/backend-api/codex/models?client_version=1.0.0` | GET | Bearer | append `-review` variants |
| `antigravity` | `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:models` | POST | Bearer | `data.models` |
| `github` | `https://api.githubcopilot.com/models` | GET | Bearer | filter `capabilities.type === "chat"` |
| `openai` | `https://api.openai.com/v1/models` | GET | Bearer | `data.data` |
| `deepseek` | `https://api.deepseek.com/models` | GET | Bearer | `data.data` |
| `groq` | `https://api.groq.com/openai/v1/models` | GET | Bearer | `data.data` |
| `xai` | `https://api.x.ai/v1/models` | GET | Bearer | `data.data` |
| `mistral` | `https://api.mistral.ai/v1/models` | GET | Bearer | `data.data` |
| `ollama` | `https://ollama.com/api/tags` | GET | none | `data.models` |
| `ollama-local` | `http://localhost:11434/api/tags` | GET | none | `data.models` |
| `gemini-cli` | `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` | POST | Bearer | `data.models` |

## Custom provider workflow (full)

### Adding an OpenAI-compatible provider (e.g., LocalAI)

```ts
// 1. Register the provider
router.registerProvider({
  id: "localai",
  baseUrl: "http://localhost:8080/v1/chat/completions",
  format: "openai",
  apiKey: "not-needed",
  noAuth: true,
  isCustom: true,
});

// 2. Register models (or fetch dynamically)
const live = await fetchLiveModels("localai", "http://localhost:8080/v1", "");
live.forEach(m => router.registerModel("localai", m));

// 3. Use it
await router.chat("localai", { model: live[0].id, messages: [...] });
```

### Adding an Anthropic-compatible provider (e.g., GLM Coding)

```ts
router.registerProvider({
  id: "my-claude-clone",
  baseUrl: "https://my-clone.example.com/v1/messages",
  format: "claude",
  apiKey: process.env.MY_CLONE_KEY,
  headers: { "anthropic-version": "2023-06-01" },
  isCustom: true,
});

router.registerModel("my-claude-clone", { id: "claude-sonnet-4-6", name: "Sonnet 4.6 (clone)" });
```

### Adding a custom embedding-only provider

```ts
router.registerProvider({
  id: "my-embedder",
  baseUrl: "http://embedder:9000/v1/embeddings",
  format: "openai",
  serviceKind: "embedding",  // restrict to embeddings
  apiKey: "k",
});
```

## Model validation

**Don't send requests with invalid model IDs** — most providers return 400 with cryptic errors. Validate first.

```ts
function isValidModel(providerId: string, modelId: string, passthroughProviders: Set<string> = new Set()): boolean {
  if (passthroughProviders.has(providerId)) return true;
  const provider = providers.get(providerId);
  if (!provider) return false;
  if (provider.passthroughModels) return true;  // e.g. OpenRouter, Vercel AI Gateway
  
  // Check static catalog
  const models = providerModels.get(providerId) || [];
  return models.some(m => m.id === modelId);
}
```

**Passthrough providers** (accept any model ID without validation):
- `openrouter` (all `provider/model` IDs)
- `vercel-ai-gateway` (all `provider/model` IDs)
- `puter` (all `provider/model` IDs)
- `glhf` (all HF model IDs)
- `aimlapi` (200+ models)
- `uncloseai` (free, no auth)
- `mimo-free` (no auth, passthrough)
- `opencode` (no auth, passthrough)
- `agentrouter` (multi-model gateway)
- `bazaarlink` (auto routing)
- `modal` (user-hosted)
- `publicai` (community)

For these, you can send any model string and the provider routes it.

## Per-model format override

Some providers expose models from a different ecosystem. Override per-model:

```js
"xiaomi-mimo": [
  { id: "mimo-v2.5", name: "MiMo V2.5" },
],
"xiaomi-tokenplan": [
  { id: "mimo-v2.5", name: "MiMo V2.5" },
  { id: "mimo-v2.5-pro-claude", name: "MiMo V2.5 Pro (Claude Native)", 
    targetFormat: "claude",   // ← override: use Claude translator
    upstreamModelId: "mimo-v2.5-pro" 
  },
],
"opencode-go": [
  { id: "minimax-m2.7", name: "MiniMax M2.7", targetFormat: "claude" },
  { id: "minimax-m2.5", name: "MiniMax M2.5", targetFormat: "claude" },
],
```

When the router sees `model: "minimax-m2.7"` on an OpenAI-format provider, it:
1. Detects `targetFormat: "claude"` on the model
2. Uses the Claude format translator instead of OpenAI
3. Sends to upstream with `upstreamModelId` if set

## Actual model lists (real, from 9router)

### OAuth providers

**Claude Code (`claude`):**
- Claude Opus 4.8 / 4.7 / 4.6
- Claude Sonnet 4.6
- Claude Opus 4.5 (20251101)
- Claude Sonnet 4.5 (20250929)
- Claude Haiku 4.5 (20251001)

**Antigravity (`antigravity`):**
- Gemini 3.5 Flash (High / Medium / Low) — via `gemini-3-flash-agent`, `gemini-3.5-flash-low`, `gemini-3.5-flash-extra-low`
- Gemini 3.1 Pro (High / Low) — via `gemini-pro-agent`, `gemini-3.1-pro-low`
- **Claude Sonnet 4.6 (Thinking)** — `claude-sonnet-4-6`
- **Claude Opus 4.6 (Thinking)** — `claude-opus-4-6-thinking`
- GPT-OSS 120B (Medium) — `gpt-oss-120b-medium`
- Gemini 3 Flash (command model, thinking disabled) — `gemini-3-flash`

**OpenAI Codex (`codex`):** GPT 5.5, GPT 5.4, GPT 5.4 Mini, GPT 5.3 Codex (5 thinking levels: xhigh/high/low/none/spark), GPT 5.5/5.4/5.3 Image
- *All chat models also have a `-review` variant for code review (separate quota family)*

**Gemini CLI (`gemini-cli`):** Gemini 3 Flash Preview, Gemini 3 Pro Preview

**Qwen Code (`qwen`):** Qwen3 Coder Plus, Qwen3 Coder Flash, Qwen3 Vision Model, Qwen3.6 Coder Model
- *(Qwen OAuth free tier was discontinued by Alibaba on 2026-04-15)*

**iFlow AI (`iflow`):** Qwen3 Coder Plus, Qwen3 Max, Qwen3 VL Plus, Qwen3 235B A22B (3 variants), Qwen3 32B, Kimi K2, DeepSeek V3.2/V3.1/V3, DeepSeek R1, GLM 4.7, iFlow ROME

**Kiro AI (`kiro`):** Claude Sonnet 4.5, Claude Haiku 4.5, DeepSeek 3.2, Qwen3 Coder Next, GLM 5, MiniMax M2.5, +thinking/agentic variants

**Cursor IDE (`cursor`):** Auto (server picks), Claude 4.5 Opus/Sonnet/Haiku, GPT 5.2 Codex, Claude 4.6 Opus Max, Claude 4.6 Sonnet Medium Thinking, Kimi K2.5, Gemini 3 Flash Preview, GPT 5.2, GPT 5.3 Codex

**GitHub Copilot (`github`):** GPT-3.5/4/4o/4o-mini/4.1/5-mini/5.2/5.2-codex/5.3-codex/5.4/5.4-mini, Claude Haiku 4.5/Opus 4.5/Sonnet 4/4.5/4.6/Opus 4.6/4.7, Gemini 2.5 Pro/3 Flash/3.1 Pro, Grok Code Fast 1, Raptor Mini, GoldenEye, Text Embedding 3 Small/Large

**KiloCode (`kilocode`):** `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4`, `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `openai/gpt-4.1`, `openai/o3`, `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner`

**Cline (`cline`):** `anthropic/claude-opus-4.7`, `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.6`, `openai/gpt-5.3-codex`, `openai/gpt-5.4`, `google/gemini-3.1-pro-preview`, `google/gemini-3.1-flash-lite-preview`, `kwaipilot/kat-coder-pro`

**Qoder (`qoder`):** Tier (auto/ultimate/performance/efficient/lite) + Frontier (Qwen 3.6 Plus, Qoder Qwen 3.7 Max, DeepSeek V4 Pro/Flash, GLM 5.1, Kimi K2.6, MiniMax M2.7)

### API key providers (highlights)

**OpenAI:** GPT-5.4/5.4-mini/5.4-nano/5.2/5.1/5/5-mini/5-nano/4o/4o-mini/4-turbo/4.1/4.1-mini/4.1-nano, o3/o3-mini/o3-pro/o4-mini/o1/o1-mini, text-embedding-3-large/small/ada-002, tts-1/tts-1-hd/gpt-4o-mini-tts, whisper-1/gpt-4o-transcribe, gpt-image-1/dall-e-3/dall-e-2

**Anthropic:** claude-sonnet-4-20250514, claude-opus-4-20250514, claude-3-5-sonnet-20241022

**Gemini:** Gemini 3.1 Pro/Flash Lite Preview, Gemini 3 Flash Preview, Gemini 2.5 Pro/Flash/Flash Lite, Gemini 2.0 Flash/Flash Lite, Gemma 4 31B IT, gemini-embedding-2-preview/001/text-embedding-005/004, gemini-3.1-flash-image-preview (Nano Banana 2), gemini-3-pro-image-preview (Nano Banana Pro), gemini-2.5-flash-image (Nano Banana), STT variants

**DeepSeek:** DeepSeek V4 Pro/Pro Max/Pro No Thinking/Flash, DeepSeek V3.2 Chat/Reasoner

**MiniMax (MiniMax):** MiniMax-M3, MiniMax-M2.7, MiniMax-M2.5, MiniMax-M2.1, MiniMax Image 01

**GLM Coding:** GLM 5.1, GLM 5, GLM 4.7, GLM 4.6V (Vision)

**Kimi:** Kimi K2.6, Kimi K2.5, Kimi K2.5 Thinking, Kimi Latest

**Xiaomi MiMo:** mimo-v2.5-pro, mimo-v2.5, mimo-v2-omni, mimo-v2-flash

**Xiaomi MiMo Token Plan:** Same as above + mimo-v2.5-pro-claude (Claude Native format), mimo-v2-tts, mimo-v2.5-tts, mimo-v2.5-tts-voiceclone, mimo-v2.5-tts-voicedesign

**Alibaba (`alicode`):** Qwen3.5 Plus, Kimi K2.5, GLM 5, MiniMax M2.5, Qwen3 Max/Coder Next/Coder Plus, GLM 4.7

**Volcengine Ark:** Doubao-Seed-2.0-Code/Pro/Lite, Doubao-Seed-Code, DeepSeek-V4-Flash/Pro, GLM-5.1, MiniMax-M2.7, Kimi-K2.6

**BytePlus:** Seed 2.0 Pro/Code Preview/Mini/Lite, Kimi K2 Thinking, GLM 4.7, GPT-OSS-120B

**Mistral:** Mistral Large 3, Codestral, Mistral Medium 3, Mistral Embed

**xAI (Grok):** Grok 4, Grok 4 Fast Reasoning, Grok Code Fast, Grok 3, Grok 2 Image

**Perplexity:** Sonar Pro, Sonar

**Cloudflare AI:** 20+ Llama/Qwen/DeepSeek/Mistral/Kimi/GLM models + 10+ image models (FLUX, SDXL, Lucid Origin, Phoenix, DreamShaper)

**HuggingFace:** FLUX.1 Schnell, SDXL Base 1.0, Whisper Large v3 (HF), Whisper Small (HF)

### Image providers

**OpenAI:** gpt-image-1, dall-e-3, dall-e-2
**Gemini:** gemini-3.1-flash-image-preview (Nano Banana 2), gemini-3-pro-image-preview (Nano Banana Pro), gemini-2.5-flash-image (Nano Banana)
**Fal.ai:** FLUX Schnell/Dev/Pro v1.1/Pro v1.1 Ultra, Recraft V3, Ideogram V2, SD 3.5 Large
**Stability AI:** Stable Image Ultra/Core, SD 3.5 Large/Large Turbo/Medium
**Black Forest Labs:** FLUX Pro 1.1/Pro 1.1 Ultra/Pro/Dev, FLUX Kontext Pro/Max (edit)
**Recraft:** Recraft V3, Recraft V2
**Runway ML:** Gen-4 Image, Gen-4 Image Turbo, Gen-4 Turbo (video), Gen-3 Alpha Turbo (video)

### TTS providers

**OpenAI:** TTS-1, TTS-1 HD, GPT-4o Mini TTS
**ElevenLabs:** Eleven Multilingual v2, Eleven Turbo v2.5
**Cartesia:** Sonic 2, Sonic 3
**PlayHT:** PlayDialog, Play 3.0 Mini
**Inworld:** inworld-tts-1.5-mini, inworld-tts-1.5-max
**Deepgram:** (no static list, dynamic)
**Local TTS:** Coqui, Tortoise, Edge TTS, Google TTS, Local Device (all no-auth)
**Xiaomi MiMo Token Plan:** mimo-v2-tts, mimo-v2.5-tts, mimo-v2.5-tts-voiceclone, mimo-v2.5-tts-voicedesign

### STT providers

**OpenAI:** Whisper 1, GPT-4o Transcribe, GPT-4o Mini Transcribe
**Groq:** Whisper Large v3, Whisper Large v3 Turbo, Distil Whisper Large v3 EN
**Deepgram:** Nova 3, Nova 2, Whisper Large
**AssemblyAI:** Universal 3 Pro, Universal 2
**NVIDIA:** Parakeet CTC 1.1B
**HuggingFace:** Whisper Large v3 (HF), Whisper Small (HF)
**Gemini:** gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash (via generateContent)

### Web search providers

Tavily, Brave Search, Serper, Exa, SearXNG, Google PSE, Linkup, SearchAPI, You.com Search

### Web fetch providers

Tavily, Exa, Firecrawl, Jina Reader

## Provider-specific data (extra config)

Some providers need additional config beyond API key:

```ts
interface ProviderConfig {
  // ... standard fields
  providerSpecificData?: {
    // Azure OpenAI
    azureEndpoint?: string;
    deployment?: string;
    apiVersion?: string;
    organization?: string;
    
    // Cloudflare AI
    accountId?: string;
    
    // Xiaomi MiMo Token Plan
    region?: "sgp" | "cn" | "ams";
    
    // Ollama local
    baseUrl?: string;  // override localhost
    
    // Qwen
    resourceUrl?: string;
    
    // Vertex AI
    projectId?: string;
    // OR Service Account JSON as apiKey
    
    // GitHub Copilot
    copilotToken?: string;
  };
}
```

## Anti-patterns to avoid

- **Don't use OAuth providers as API-key providers.** Auth flow is fundamentally different; session hijacking ≠ API access.
- **Don't hardcode model lists.** Allow runtime registration + dynamic fetching.
- **Don't validate against the full catalog when passthrough is enabled.** Skip validation for `openrouter`, `vercel-ai-gateway`, etc.
- **Don't ignore `targetFormat`.** Xiaomi MiMo and some OpenCode models need Claude format translator.
- **Don't ignore `strip`.** Some models (Kiro DeepSeek 3.2) reject image/audio content — strip before sending.
- **Don't send requests with invalid model IDs.** Validate first; save on 400s.
- **Don't conflate service kinds.** An embedding provider should not be called for chat, and vice versa.

## See also

- `multi-provider-routing.md` — translator registry, OAuth flows, format detection
- `templates/multi-provider-router.ts` — working TypeScript implementation
- `templates/multi-provider-router.py` — Python equivalent
- `tests/templates/multi-provider-router.test.ts` — vitest test suite

## Provenance

- **Repository:** https://github.com/decolua/9router.git
- **Files referenced:**
  - `open-sse/config/providers.js` (100+ provider config)
  - `open-sse/config/providerModels.js` (934 lines: model registry)
  - `open-sse/config/models.js` (model metadata defaults)
  - `src/shared/constants/providers.js` (291 lines: 7-category provider classification)
  - `src/shared/constants/models.js` (model validation helpers)
  - `src/shared/utils/providerModelsFetcher.js` (live model fetcher with cache)
  - `src/app/api/providers/[id]/models/route.js` (dynamic model listing endpoint)
  - `src/app/api/providers/[id]/test-models/route.js` (test models endpoint)
  - `src/app/api/providers/validate/route.js` (API key validation per provider)
