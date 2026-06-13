/**
 * api-key-validator.ts
 *
 * Provider API key validation with per-provider probe logic.
 * Extracted from 9router src/app/api/providers/validate/route.js.
 *
 * Different providers use different auth schemes (Bearer, x-api-key, query param,
 * basic auth, no auth). The validator probes each correctly.
 *
 * Usage:
 *   import { validateApiKey, PROVIDER_PROBES } from "./api-key-validator";
 *
 *   const result = await validateApiKey("anthropic", "sk-ant-...");
 *   if (result.valid) console.log("✅ Key works");
 */

export type ProbeResult = { valid: boolean; error?: string };

// Per-provider probe config (subset of 9router validators)
export interface ProbeConfig {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  // Status codes that mean "valid" (default: 200)
  validStatuses?: number[];
  // Status codes that mean "invalid" (default: 401, 403)
  invalidStatuses?: number[];
  // Custom check function
  check?: (res: Response) => Promise<boolean> | boolean;
}

export const PROVIDER_PROBES: Record<string, ProbeConfig> = {
  // === OpenAI-compatible (probe /v1/models) ===
  openai: { url: "https://api.openai.com/v1/models" },
  groq: { url: "https://api.groq.com/openai/v1/models" },
  xai: { url: "https://api.x.ai/v1/models" },
  mistral: { url: "https://api.mistral.ai/v1/models" },
  perplexity: { url: "https://api.perplexity.ai/models" },
  together: { url: "https://api.together.xyz/v1/models" },
  fireworks: { url: "https://api.fireworks.ai/inference/v1/models" },
  cerebras: { url: "https://api.cerebras.ai/v1/models" },
  cohere: { url: "https://api.cohere.ai/v1/models" },
  nebius: { url: "https://api.studio.nebius.ai/v1/models" },
  siliconflow: { url: "https://api.siliconflow.com/v1/models" },
  hyperbolic: { url: "https://api.hyperbolic.xyz/v1/models" },
  ollama: { url: "https://ollama.com/api/tags" },
  chutes: { url: "https://llm.chutes.ai/v1/models" },
  nvidia: { url: "https://integrate.api.nvidia.com/v1/models" },
  vercel: { url: "https://ai-gateway.vercel.sh/v1/models" },
  openrouter: { url: "https://openrouter.ai/api/v1/models" },
  nanobanana: { url: "https://api.nanobananaapi.ai/v1/models" },

  // === Anthropic (probe /v1/models with x-api-key header) ===
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" },
  },

  // === Gemini (probe with key query param) ===
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models?key=<KEY>" },

  // === Claude-format providers (probe with test message) ===
  glm: {
    url: "https://api.z.ai/api/anthropic/v1/messages",
    method: "POST",
    headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" },
    body: { model: "glm-5", max_tokens: 1, messages: [{ role: "user", content: "test" }] },
    validStatuses: [200, 400],  // 400 = auth OK, model not found
  },
  kimi: {
    url: "https://api.kimi.com/coding/v1/messages",
    method: "POST",
    headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" },
    body: { model: "kimi-k2.5", max_tokens: 1, messages: [{ role: "user", content: "test" }] },
    validStatuses: [200, 400],
  },
  minimax: {
    url: "https://api.minimax.io/anthropic/v1/messages",
    method: "POST",
    headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" },
    body: { model: "MiniMax-M3", max_tokens: 1, messages: [{ role: "user", content: "test" }] },
    validStatuses: [200, 400],
  },
  agentrouter: {
    url: "https://agentrouter.org/v1/messages",
    method: "POST",
    headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" },
    body: { model: "claude-opus-4-6", max_tokens: 1, messages: [{ role: "user", content: "test" }] },
    validStatuses: [200, 400],
  },

  // === Deepgram (uses Token prefix) ===
  deepgram: {
    url: "https://api.deepgram.com/v1/projects",
    headers: { Authorization: "Token <KEY>" },
  },

  // === Voyage AI ===
  voyage: { url: "https://api.voyageai.com/v1/embeddings", method: "POST", body: { model: "voyage-3.5", input: "test" } },

  // === Jina (Bearer) ===
  jina: { url: "https://api.jina.ai/v1/embeddings", method: "POST", body: { model: "jina-embeddings-v3", input: ["test"] } },

  // === xAI (special: 403 = valid but no credit) ===
  xai_special: {
    url: "https://api.x.ai/v1/models",
    validStatuses: [200, 403],
  },
};

const DEFAULT_INVALID = [401, 403];

export async function validateApiKey(providerId: string, apiKey: string): Promise<ProbeResult> {
  const probe = PROVIDER_PROBES[providerId];
  if (!probe) {
    return { valid: false, error: `No probe defined for provider: ${providerId}` };
  }

  // Build URL and headers
  const url = probe.url.replace("<KEY>", encodeURIComponent(apiKey));
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (probe.headers) {
    for (const [k, v] of Object.entries(probe.headers)) {
      headers[k] = v.replace("<KEY>", apiKey);
    }
  }
  // Default Bearer for non-special providers
  if (providerId !== "deepgram" && providerId !== "anthropic" && providerId !== "gemini" && !providerId.startsWith("glm") && !providerId.startsWith("kimi") && !providerId.startsWith("minimax") && !probe.headers?.Authorization && !probe.headers?.["x-api-key"]) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const init: RequestInit = { method: probe.method ?? "GET", headers, signal: AbortSignal.timeout(8000) };
  if (probe.body) init.body = JSON.stringify(probe.body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return { valid: false, error: `Network error: ${(err as Error).message}` };
  }

  // Custom check
  if (probe.check) {
    const ok = await probe.check(res);
    return { valid: ok, error: ok ? undefined : `Custom check failed (status ${res.status})` };
  }

  // Status-based check
  const validStatuses = probe.validStatuses ?? [200];
  const invalidStatuses = probe.invalidStatuses ?? DEFAULT_INVALID;
  if (validStatuses.includes(res.status)) return { valid: true };
  if (invalidStatuses.includes(res.status)) return { valid: false, error: `Invalid key (${res.status})` };

  // Other status: assume valid (e.g. 400 model not found = key works)
  return { valid: true, error: `Non-standard status ${res.status} (assumed valid)` };
}
