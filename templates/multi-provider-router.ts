/**
 * multi-provider-router.ts
 *
 * Universal multi-provider LLM router extracted from 9router.
 * Pattern: OpenAI-compatible surface + pluggable format translators
 *          + custom provider registration + multi-account pool.
 *
 * Usage:
 *   import { MultiProviderRouter, PROVIDER_CATALOG } from "./multi-provider-router";
 *
 *   const router = new MultiProviderRouter();
 *   router.registerProvider({ id: "my-llm", baseUrl: "...", format: "openai", apiKey: "..." });
 *   const result = await router.chat({ model: "my-llm/gpt-4o", messages: [...] });
 */

// === Format identifiers ===
export const FORMATS = {
  OPENAI: "openai",
  OPENAI_RESPONSES: "openai-responses",
  CLAUDE: "claude",
  GEMINI: "gemini",
} as const;

export type FormatId = (typeof FORMATS)[keyof typeof FORMATS];

// === Public types ===
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ChatContentPart {
  type: "text" | "image_url" | "input_audio";
  text?: string;
  image_url?: { url: string };
  input_audio?: { data: string; format: string };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Tool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning_effort?: "low" | "medium" | "high";
}

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  baseUrls?: string[]; // edge failover
  format: FormatId | string; // allow custom format strings
  apiKey?: string;
  headers?: Record<string, string>;
  authHeader?: string; // default "Authorization: Bearer"
  noAuth?: boolean;
  isCustom?: boolean;
  retry?: Record<number, number>;
  timeoutMs?: number;
  clientId?: string;
  tokenUrl?: string;
  authUrl?: string;
}

export interface AccountState {
  id: string;
  apiKey: string;
  rateLimitedUntil?: number; // ms epoch
  consecutiveUseCount: number;
  consecutiveLimit: number; // sticky limit
}

export interface ProviderState {
  config: ProviderConfig;
  accounts: AccountState[];
  cursor: number;
  models?: ModelEntry[];  // optional, populated by registerModel or fetchLiveModels
}

export interface ModelEntry {
  id: string;
  name: string;
  type?: "llm" | "chat" | "embedding" | "image" | "tts" | "stt" | "video" | "music";
  capabilities?: string[];
  params?: string[];
  targetFormat?: string;       // override format translator (e.g. "claude" for Xiaomi MiMo on OpenAI provider)
  upstreamModelId?: string;    // actual ID sent to upstream
  quotaFamily?: "normal" | "review";
  strip?: ("image" | "audio")[];  // content types to strip before sending
  thinking?: boolean;
  contextLength?: number;
}

// === Format translator registry ===
type RequestTranslator = (model: string, body: ChatRequest, credentials: AccountState | null) => unknown;
type ResponseTranslator = (chunk: unknown, state: { model: string; format: FormatId | string }) => unknown;

const requestRegistry = new Map<string, RequestTranslator>();
const responseRegistry = new Map<string, ResponseTranslator>();

export function registerTranslator(
  from: FormatId,
  to: FormatId,
  requestFn?: RequestTranslator,
  responseFn?: ResponseTranslator,
): void {
  const key = `${from}:${to}`;
  if (requestFn) requestRegistry.set(key, requestFn);
  if (responseFn) responseRegistry.set(key, responseFn);
}

// === Built-in translators (minimal, not exhaustive — see 9router for full versions) ===

// OpenAI -> OpenAI (identity, no-op)
registerTranslator(FORMATS.OPENAI, FORMATS.OPENAI, (m, b) => b, (c) => c);

// OpenAI -> Claude (basic message + system conversion)
registerTranslator(FORMATS.OPENAI, FORMATS.CLAUDE, (model, body) => {
  const systemMsg = body.messages.find((m) => m.role === "system");
  const restMessages = body.messages.filter((m) => m.role !== "system");
  return {
    model,
    max_tokens: body.max_tokens ?? 4096,
    system: typeof systemMsg?.content === "string" ? systemMsg.content : undefined,
    messages: restMessages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    })),
    tools: body.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    })),
  };
});

// OpenAI -> Gemini (basic conversion)
registerTranslator(FORMATS.OPENAI, FORMATS.GEMINI, (model, body) => {
  const contents = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : "" }],
    }));
  const systemMsg = body.messages.find((m) => m.role === "system");
  return {
    contents,
    ...(systemMsg && typeof systemMsg.content === "string"
      ? { systemInstruction: { role: "user", parts: [{ text: systemMsg.content }] } }
      : {}),
  };
});

// === Format detection (URL pathname → format) ===
export function detectFormat(pathname: string, body?: { input?: unknown }): FormatId | null {
  if (pathname.includes("/v1/responses")) return FORMATS.OPENAI_RESPONSES;
  if (pathname.includes("/v1/messages")) return FORMATS.CLAUDE;
  if (pathname.includes("/v1/chat/completions") && Array.isArray(body?.input)) return FORMATS.OPENAI;
  return null;
}

// === Error rules (config-driven, from 9router errorConfig.js) ===
export interface ErrorRule {
  match: { status?: number; text?: RegExp };
  action: "retry" | "rotate" | "cooldown" | "fail";
  cooldownMs?: number;
}

export const DEFAULT_ERROR_RULES: ErrorRule[] = [
  { match: { status: 401 }, action: "fail" },
  { match: { status: 403 }, action: "fail" },
  { match: { status: 429 }, action: "cooldown", cooldownMs: 60_000 },
  { match: { status: 500 }, action: "retry" },
  { match: { status: 502 }, action: "retry" },
  { match: { status: 503 }, action: "retry" },
  { match: { text: /rate.?limit/i }, action: "cooldown", cooldownMs: 30_000 },
  { match: { text: /quota.?exceeded/i }, action: "cooldown", cooldownMs: 300_000 },
];

// === Usage tracking ===
export interface UsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  accountId: string;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
  latencyMs: number;
  success: boolean;
}

export class UsageTracker {
  private records: UsageRecord[] = [];

  record(r: UsageRecord): void {
    this.records.push(r);
  }

  byProvider(): Record<string, { calls: number; tokens: number }> {
    return this.records.reduce(
      (acc, r) => {
        if (!acc[r.provider]) acc[r.provider] = { calls: 0, tokens: 0 };
        acc[r.provider].calls++;
        acc[r.provider].tokens += r.inputTokens + r.outputTokens;
        return acc;
      },
      {} as Record<string, { calls: number; tokens: number }>,
    );
  }

  byModel(): Record<string, { calls: number; tokens: number }> {
    return this.records.reduce(
      (acc, r) => {
        const key = `${r.provider}/${r.model}`;
        if (!acc[key]) acc[key] = { calls: 0, tokens: 0 };
        acc[key].calls++;
        acc[key].tokens += r.inputTokens + r.outputTokens;
        return acc;
      },
      {} as Record<string, { calls: number; tokens: number }>,
    );
  }

  recent(limit = 50): UsageRecord[] {
    return this.records.slice(-limit);
  }
}

// === Main router ===
export class MultiProviderRouter {
  private providers = new Map<string, ProviderState>();
  private usage = new UsageTracker();
  private errorRules: ErrorRule[] = DEFAULT_ERROR_RULES;
  private hooks: Array<{ event: string; fn: (data: unknown) => void }> = [];

  // --- Provider management ---
  registerProvider(config: ProviderConfig): void {
    if (this.providers.has(config.id)) {
      throw new Error(`Provider already registered: ${config.id}`);
    }
    const account: AccountState = {
      id: `${config.id}-account-0`,
      apiKey: config.apiKey ?? "",
      consecutiveUseCount: 0,
      consecutiveLimit: 5, // sticky: rotate every 5 requests
    };
    this.providers.set(config.id, { config, accounts: [account], cursor: 0 });
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  removeProvider(id: string): boolean {
    return this.providers.delete(id);
  }

  getProvider(id: string): ProviderState | undefined {
    return this.providers.get(id);
  }

  // --- Account management (multi-key pool) ---
  addAccount(providerId: string, apiKey: string): void {
    const state = this.providers.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);
    const idx = state.accounts.length;
    state.accounts.push({
      id: `${providerId}-account-${idx}`,
      apiKey,
      consecutiveUseCount: 0,
      consecutiveLimit: 5,
    });
  }

  // --- Account selection (round-robin with sticky + cooldown skip) ---
  private selectAccount(providerId: string): AccountState {
    const state = this.providers.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);

    const now = Date.now();
    const n = state.accounts.length;

    // Try at most n times to find an available account
    for (let i = 0; i < n; i++) {
      const account = state.accounts[state.cursor % n];
      state.cursor = (state.cursor + 1) % n;

      // Skip if in cooldown
      if (account.rateLimitedUntil && account.rateLimitedUntil > now) continue;

      // Sticky limit: if hit, reset count + skip
      if (account.consecutiveUseCount >= account.consecutiveLimit) {
        account.consecutiveUseCount = 0;
        continue;
      }

      account.consecutiveUseCount++;
      return account;
    }

    // All accounts unavailable, return the cursor one (will likely 429, but we tried)
    const fallback = state.accounts[state.cursor % n];
    fallback.consecutiveUseCount++;
    return fallback;
  }

  // --- OAuth: stub for refresh-token flow ---
  async refreshOAuthToken(providerId: string, refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const state = this.providers.get(providerId);
    if (!state?.config.tokenUrl) throw new Error(`Provider ${providerId} has no tokenUrl`);
    const res = await fetch(state.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: state.config.clientId ?? "",
      }).toString(),
    });
    if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status}`);
    return (await res.json()) as { accessToken: string; expiresIn: number };
  }

  // --- Device code polling (for CLI / headless auth) ---
  async pollDeviceCode(
    providerId: string,
    deviceCode: string,
    codeVerifier: string,
    intervalSec: number,
    deadlineMs = 120_000,
  ): Promise<{ accessToken: string }> {
    const state = this.providers.get(providerId);
    if (!state?.config.tokenUrl) throw new Error(`Provider ${providerId} has no tokenUrl`);
    const deadline = Date.now() + deadlineMs;
    let interval = intervalSec;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval * 1000));
      const res = await fetch(state.config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: state.config.clientId ?? "",
          code_verifier: codeVerifier,
        }).toString(),
      });
      const data = (await res.json()) as { accessToken?: string; error?: string };
      if (data.accessToken) return { accessToken: data.accessToken };
      if (data.error === "slow_down") interval = Math.min(interval + 5, 30);
      if (data.error === "expired_token" || data.error === "access_denied") {
        throw new Error(`Device code auth failed: ${data.error}`);
      }
    }
    throw new Error("Device code authorization timeout");
  }

  // --- Translation ---
  private translateRequest(
    sourceFormat: FormatId,
    targetFormat: FormatId,
    model: string,
    body: ChatRequest,
    credentials: AccountState | null,
  ): unknown {
    let result: unknown = body;
    if (sourceFormat !== FORMATS.OPENAI) {
      const toOpenAI = requestRegistry.get(`${sourceFormat}:${FORMATS.OPENAI}`);
      if (toOpenAI) result = toOpenAI(model, body, credentials);
    }
    // Step 2: openai -> target (if target != openai)
    if (targetFormat !== FORMATS.OPENAI) {
      const fromOpenAI = requestRegistry.get(`${FORMATS.OPENAI}:${targetFormat}`);
      if (fromOpenAI) result = fromOpenAI(model, result as ChatRequest, credentials);
    }
    return result;
  }

  // --- Model registry ---
  registerModel(providerId: string, entry: ModelEntry): void {
    const state = this.providers.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);
    if (!state.models) state.models = [];
    // Replace if same id exists
    const existingIdx = state.models.findIndex((m) => m.id === entry.id);
    if (existingIdx >= 0) state.models[existingIdx] = entry;
    else state.models.push(entry);
  }

  getProviderModels(providerId: string): ModelEntry[] {
    return this.providers.get(providerId)?.models ?? [];
  }

  getDefaultModel(providerId: string): string | null {
    const models = this.getProviderModels(providerId);
    return models[0]?.id ?? null;
  }

  isValidModel(providerId: string, modelId: string, passthrough = false): boolean {
    if (passthrough) return true;
    return this.getProviderModels(providerId).some((m) => m.id === modelId);
  }

  getModelEntry(providerId: string, modelId: string): ModelEntry | null {
    return this.getProviderModels(providerId).find((m) => m.id === modelId) ?? null;
  }

  getModelTargetFormat(providerId: string, modelId: string): FormatId | string | null {
    return this.getModelEntry(providerId, modelId)?.targetFormat ?? null;
  }

  getModelUpstreamId(providerId: string, modelId: string): string {
    return this.getModelEntry(providerId, modelId)?.upstreamModelId ?? modelId;
  }

  getModelStrip(providerId: string, modelId: string): ("image" | "audio")[] {
    return this.getModelEntry(providerId, modelId)?.strip ?? [];
  }

  // --- Live model fetching (provider's /v1/models endpoint) ---
  async fetchLiveModels(providerId: string, opts?: { baseUrl?: string; apiKey?: string }): Promise<ModelEntry[]> {
    const state = this.providers.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);
    const baseUrl = (opts?.baseUrl ?? state.config.baseUrl).replace(/\/chat\/completions$|\/messages$/, "");
    const apiKey = opts?.apiKey ?? state.accounts[0]?.apiKey ?? "";
    const headers: Record<string, string> = { ...state.config.headers };
    if (apiKey && !state.config.noAuth) {
      const authHeader = state.config.authHeader ?? "Authorization";
      headers[authHeader] = state.config.authHeader ? apiKey : `Bearer ${apiKey}`;
    }
    const res = await fetch(`${baseUrl}/models`, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[]; models?: unknown[] };
    const arr = (data.data ?? data.models ?? []) as Array<{ id: string; name?: string }>;
    return arr.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      type: m.id.includes("embed") ? "embedding" : m.id.includes("dall-e") || m.id.includes("image") ? "image" : "llm",
    }));
  }

  // --- Main chat method ---
  async chat(providerId: string, request: ChatRequest): Promise<unknown> {
    const state = this.providers.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);
    const account = this.selectAccount(providerId);
    const start = Date.now();

    // Translate to target format
    const translated = this.translateRequest(FORMATS.OPENAI, state.config.format as FormatId, request.model, request, account);

    // Build headers
    const headers: Record<string, string> = { ...state.config.headers };
    if (!state.config.noAuth) {
      const apiKey = account.apiKey;
      if (state.config.authHeader) {
        headers[state.config.authHeader] = apiKey;
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }
    headers["Content-Type"] = "application/json";

    // Send
    let res: Response;
    try {
      res = await fetch(state.config.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(translated),
        signal: AbortSignal.timeout(state.config.timeoutMs ?? 60_000),
      });
    } catch (err) {
      this.usage.record({
        timestamp: start,
        provider: providerId,
        model: request.model,
        accountId: account.id,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - start,
        success: false,
      });
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      // Apply ALL matching rules (don't break on first hit — text rules can stack with status rules)
      for (const rule of this.errorRules) {
        const statusMatch = rule.match.status === res.status;
        const textMatch = rule.match.text && rule.match.text.test(text);
        if (!statusMatch && !textMatch) continue;
        if (rule.action === "cooldown" && rule.cooldownMs) {
          account.rateLimitedUntil = Date.now() + rule.cooldownMs;
        }
        if (rule.action === "rotate") account.consecutiveLimit = 1; // force rotate
      }
      this.usage.record({
        timestamp: start,
        provider: providerId,
        model: request.model,
        accountId: account.id,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - start,
        success: false,
      });
      throw new Error(`Provider ${providerId} returned ${res.status}: ${text.slice(0, 200)}`);
    }

    this.usage.record({
      timestamp: start,
      provider: providerId,
      model: request.model,
      accountId: account.id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - start,
      success: true,
    });
    return res.json();
  }

  // --- Observability ---
  getUsage(): UsageTracker {
    return this.usage;
  }

  on(event: string, fn: (data: unknown) => void): void {
    this.hooks.push({ event, fn });
  }
}

// === Pre-configured provider catalog (subset of 9router's 100+) ===
export const PROVIDER_CATALOG: Record<string, Omit<ProviderConfig, "apiKey">> = {
  openai: { id: "openai", baseUrl: "https://api.openai.com/v1/chat/completions", format: FORMATS.OPENAI },
  anthropic: { id: "anthropic", baseUrl: "https://api.anthropic.com/v1/messages", format: FORMATS.CLAUDE },
  gemini: {
    id: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: FORMATS.GEMINI,
  },
  groq: { id: "groq", baseUrl: "https://api.groq.com/openai/v1/chat/completions", format: FORMATS.OPENAI },
  openrouter: { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1/chat/completions", format: FORMATS.OPENAI },
  ollama: { id: "ollama", baseUrl: "http://localhost:11434/api/chat", format: FORMATS.OPENAI },
  deepseek: { id: "deepseek", baseUrl: "https://api.deepseek.com/chat/completions", format: FORMATS.OPENAI },
  xai: { id: "xai", baseUrl: "https://api.x.ai/v1/chat/completions", format: FORMATS.OPENAI },
  mistral: { id: "mistral", baseUrl: "https://api.mistral.ai/v1/chat/completions", format: FORMATS.OPENAI },
  together: { id: "together", baseUrl: "https://api.together.xyz/v1/chat/completions", format: FORMATS.OPENAI },
};
