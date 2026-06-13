# Full-Stack AI Agent — Starter

A working full-stack AI agent built with the Hera Framework + 9router-extracted templates.

**What this does:**
- Chat with 100+ LLM providers via `multi-provider-router.ts`
- Multi-modal input (text + image + audio + file) via `multimodal-input.ts`
- Text-to-speech via `tts-provider.ts` (10+ providers)
- Speech-to-text via `stt-provider.ts` (8+ providers)
- Image generation via `image-provider.ts` (12+ providers)
- Web search via `web-search.ts` (9+ providers)
- Web fetch/scrape via `web-fetch.ts` (4+ providers)
- Text embeddings via `embedding-provider.ts` (11+ providers)
- OAuth flows (auth code + PKCE + device code polling) via `multi-provider-router.ts`
- Quota tracking via `quota-tracker.ts`
- Provider validation via `api-key-validator.ts`

## Run

```bash
# Set your API key
export OPENAI_API_KEY=sk-...
# OR
export ANTHROPIC_API_KEY=sk-ant-...

# Install
npm install

# Start
npm start
```

## Architecture

```
src/
├── index.ts                    # Main entry
├── agent/
│   ├── loop.ts                 # Agent loop (drives conversation)
│   ├── tools.ts                # Tool registry
│   └── memory.ts               # Conversation history
├── providers/
│   ├── router.ts               # Multi-provider LLM router
│   ├── tts.ts                  # TTS provider
│   ├── stt.ts                  # STT provider
│   ├── image.ts                # Image gen provider
│   ├── search.ts               # Web search
│   ├── fetch.ts                # Web fetch
│   └── embed.ts                # Embeddings
├── quota/
│   └── tracker.ts              # Quota tracking + persistence
├── cli.ts                      # Interactive chat CLI
└── server.ts                   # HTTP API (optional)
```

## Add a custom provider

```bash
npx hera provider add local-llm \
  --url http://localhost:8080/v1/chat/completions \
  --format openai \
  --key none
```

## Test a provider

```bash
npx hera provider test openai
npx hera provider models openai
```

## Code examples

### Basic chat
```ts
import { MultiProviderRouter, PROVIDER_CATALOG } from "hera";

const router = new MultiProviderRouter();
router.registerProvider({ ...PROVIDER_CATALOG.openai, apiKey: process.env.OPENAI_API_KEY });

const reply = await router.chat("openai", {
  model: "gpt-5.4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Multi-modal (vision)
```ts
const reply = await router.chat("openai", {
  model: "gpt-5.4",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What's in this image?" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
    ],
  }],
});
```

### Multi-account pool with rotation
```ts
router.addAccount("openai", key2);
router.addAccount("openai", key3);
// Round-robin + sticky + cooldown automatically
```

### Quota tracking
```ts
import { QuotaTracker } from "hera";
const tracker = new QuotaTracker({
  limits: [{ provider: "openai", maxRequestsPerMinute: 60, maxCostPerDay: 10 }],
});
tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 100, outputTokens: 50, cost: 0.01 });
```

### OAuth device code (e.g. Kiro, Qwen, Kimi)
```ts
const tokens = await router.pollDeviceCode("kiro", deviceCode, codeVerifier, 5, 120_000);
```

## What you can build

- **Coding assistant** (Claude + OpenAI + Antigravity)
- **Voice assistant** (TTS + STT + LLM)
- **Image creator** (Image gen + LLM critique)
- **Research agent** (Web search + fetch + LLM synthesis)
- **Multi-language tutor** (LLM + TTS in any language)
- **Customer support bot** (LLM + RAG via embeddings)

## License

Same as Hera Framework (see parent repo).
