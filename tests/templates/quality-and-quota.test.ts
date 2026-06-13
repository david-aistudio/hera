import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSpoofHeaders, getDynamicSpoofHeaders, SPOOF_PROFILES } from "../../templates/spoof-headers.js";
import { validateApiKey, PROVIDER_PROBES } from "../../templates/api-key-validator.js";
import { wrapInAntigravity, ANTIGRAVITY_DEFAULT_SYSTEM, DEFAULT_SAFETY_SETTINGS, sanitizeGeminiFunctionName, generateAntigravityProjectId } from "../../templates/antigravity-wrapper.js";
import { QuotaTracker } from "../../templates/quota-tracker.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

// ============================================================
// SPOOF HEADERS
// ============================================================
describe("spoof-headers", () => {
  it("returns Claude CLI fingerprint with all required fields", () => {
    const h = SPOOF_PROFILES["claude-cli"];
    expect(h["Anthropic-Version"]).toBe("2023-06-01");
    expect(h["User-Agent"]).toMatch(/^claude-cli\//);
    expect(h["X-Stainless-Arch"]).toMatch(/^(x64|arm64|x86|other::)/);
    expect(h["X-Stainless-Os"]).toMatch(/^(MacOS|Linux|Windows|FreeBSD|Other::)/);
    expect(h["X-Stainless-Timeout"]).toBe("600");
  });

  it("returns Codex CLI fingerprint", () => {
    expect(SPOOF_PROFILES["codex-cli"].originator).toBe("codex_cli_rs");
    expect(SPOOF_PROFILES["codex-cli"]["User-Agent"]).toMatch(/^codex_cli_rs\//);
  });

  it("returns Antigravity fingerprint", () => {
    expect(SPOOF_PROFILES.antigravity["User-Agent"]).toMatch(/^antigravity\//);
  });

  it("returns Kiro fingerprint (AWS eventstream)", () => {
    expect(SPOOF_PROFILES.kiro.Accept).toBe("application/vnd.amazon.eventstream");
    expect(SPOOF_PROFILES.kiro["X-Amz-Target"]).toBe("AmazonCodeWhispererStreamingService.GenerateAssistantResponse");
  });

  it("merges extra headers", () => {
    const h = getSpoofHeaders("claude-cli", { "X-Custom": "value" });
    expect(h["X-Custom"]).toBe("value");
    expect(h["Anthropic-Version"]).toBe("2023-06-01");
  });

  it("getDynamicSpoofHeaders updates platform fields", () => {
    const h = getDynamicSpoofHeaders("claude-cli");
    expect(h["X-Stainless-Arch"]).toBeDefined();
    expect(h["X-Stainless-Os"]).toBeDefined();
  });
});

// ============================================================
// API KEY VALIDATOR
// ============================================================
describe("api-key-validator", () => {
  it("has probes for major providers", () => {
    expect(PROVIDER_PROBES.openai).toBeDefined();
    expect(PROVIDER_PROBES.anthropic).toBeDefined();
    expect(PROVIDER_PROBES.gemini).toBeDefined();
    expect(PROVIDER_PROBES.groq).toBeDefined();
    expect(PROVIDER_PROBES.deepgram).toBeDefined();
  });

  it("validates OpenAI key with 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await validateApiKey("openai", "sk-test");
    expect(result.valid).toBe(true);
  });

  it("rejects OpenAI key with 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });
    const result = await validateApiKey("openai", "sk-bad");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("401");
  });

  it("validates Anthropic with x-api-key header", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await validateApiKey("anthropic", "sk-ant-test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("uses query param for Gemini", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await validateApiKey("gemini", "AIza-test");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=AIza-test");
  });

  it("accepts 200 OR 400 for Claude-format providers (model-not-found = auth ok)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "model not found" });
    const result = await validateApiKey("glm", "glmt-1");
    expect(result.valid).toBe(true);
  });

  it("uses Token prefix for Deepgram", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await validateApiKey("deepgram", "dg-test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Token dg-test");
  });

  it("returns error for unknown provider", async () => {
    const result = await validateApiKey("unknown", "x");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("No probe");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const result = await validateApiKey("openai", "sk-test");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

// ============================================================
// ANTIGRAVITY WRAPPER
// ============================================================
describe("antigravity-wrapper", () => {
  it("exports default system prompt", () => {
    expect(ANTIGRAVITY_DEFAULT_SYSTEM).toContain("Antigravity");
    expect(ANTIGRAVITY_DEFAULT_SYSTEM).toContain("Gemini 3");
  });

  it("exports default safety settings (all OFF)", () => {
    expect(DEFAULT_SAFETY_SETTINGS.length).toBe(5);
    expect(DEFAULT_SAFETY_SETTINGS.every((s) => s.threshold === "OFF")).toBe(true);
  });

  it("generates 26-char project ID", () => {
    const id = generateAntigravityProjectId();
    expect(id).toMatch(/^[a-z0-9]{26}$/);
  });

  it("sanitizes function names", () => {
    expect(sanitizeGeminiFunctionName("get_weather")).toBe("get_weather");
    expect(sanitizeGeminiFunctionName("get weather!")).toBe("get_weather_");
    expect(sanitizeGeminiFunctionName("123abc")).toBe("_123abc");
    expect(sanitizeGeminiFunctionName("")).toBe("_unknown");
  });

  it("wraps request in Cloud Code envelope with project + sessionId", () => {
    const envelope = wrapInAntigravity("claude-sonnet-4-6", { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { temperature: 1 } }, { projectId: "test-project", email: "user@example.com" });
    expect(envelope.project).toBe("test-project");
    expect(envelope.model).toBe("claude-sonnet-4-6");
    expect(envelope.userAgent).toBe("antigravity");
    expect(envelope.requestType).toBe("agent");
    const req = envelope.request as Record<string, unknown>;
    expect(req.sessionId).toBeDefined();
    expect(req.generationConfig).toEqual({ temperature: 1 });
  });

  it("double-injects system prompt to prevent override", () => {
    const envelope = wrapInAntigravity("claude-sonnet-4-6", { contents: [] }, {});
    const req = envelope.request as Record<string, unknown>;
    const si = req.systemInstruction as { parts: Array<{ text: string }> };
    expect(si.parts.length).toBe(2);
    expect(si.parts[0].text).toContain("Antigravity");
    expect(si.parts[1].text).toContain("[ignore]");
  });

  it("merges user system prompt with default", () => {
    const envelope = wrapInAntigravity("claude-sonnet-4-6", { contents: [], systemInstruction: { role: "user", parts: [{ text: "You are a pirate" }] } }, {});
    const req = envelope.request as Record<string, unknown>;
    const si = req.systemInstruction as { parts: Array<{ text: string }> };
    expect(si.parts.length).toBe(3);
    expect(si.parts[2].text).toBe("You are a pirate");
  });

  it("adds toolConfig=VALIDATED when tools present", () => {
    const envelope = wrapInAntigravity("claude-sonnet-4-6", { contents: [], tools: [{ functionDeclarations: [] }] }, {});
    const req = envelope.request as Record<string, unknown>;
    expect((req.toolConfig as { functionCallingConfig: { mode: string } }).functionCallingConfig.mode).toBe("VALIDATED");
  });

  it("uses 'gemini-cli' userAgent when isAntigravity=false", () => {
    const envelope = wrapInAntigravity("gemini-3-flash", { contents: [] }, {}, false);
    expect(envelope.userAgent).toBe("gemini-cli");
    expect(envelope.requestType).toBeUndefined();
  });
});

// ============================================================
// QUOTA TRACKER
// ============================================================
describe("QuotaTracker", () => {
  let tracker: QuotaTracker;
  beforeEach(() => { tracker = new QuotaTracker(); });

  it("records and summarizes usage by provider", () => {
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 100, outputTokens: 50, cost: 0.01 });
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 200, outputTokens: 100, cost: 0.02 });
    tracker.record({ provider: "anthropic", model: "claude-sonnet-4-6", accountId: "a2", inputTokens: 50, outputTokens: 25 });
    const sum = tracker.summarize();
    expect(sum.byProvider.openai.requests).toBe(2);
    expect(sum.byProvider.openai.tokens).toBe(450);
    expect(sum.byProvider.openai.cost).toBeCloseTo(0.03);
    expect(sum.byProvider.anthropic.requests).toBe(1);
    expect(sum.byModel["openai/gpt-5.4"].tokens).toBe(450);
    expect(sum.byAccount.a1.tokens).toBe(450);
    expect(sum.byAccount.a2.tokens).toBe(75);
  });

  it("enforces per-minute request limit", () => {
    tracker.addLimit({ provider: "openai", maxRequestsPerMinute: 2 });
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 0, outputTokens: 0 });
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 0, outputTokens: 0 });
    const result = tracker.checkLimit("openai", "gpt-5.4", "a1");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Rate limit");
  });

  it("enforces per-day cost limit", () => {
    tracker.addLimit({ provider: "openai", maxCostPerDay: 1.0 });
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 0, outputTokens: 0, cost: 0.6 });
    const result = tracker.checkLimit("openai", "gpt-5.4", "a1");
    expect(result.ok).toBe(true);
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 0, outputTokens: 0, cost: 0.5 });
    const result2 = tracker.checkLimit("openai", "gpt-5.4", "a1");
    expect(result2.ok).toBe(false);
    expect(result2.reason).toContain("cost limit");
  });

  it("scopes limits by model", () => {
    tracker.addLimit({ provider: "openai", model: "gpt-5.4", maxRequestsPerMinute: 1 });
    tracker.record({ provider: "openai", model: "gpt-5.4", accountId: "a1", inputTokens: 0, outputTokens: 0 });
    expect(tracker.checkLimit("openai", "gpt-5.4", "a1").ok).toBe(false);
    expect(tracker.checkLimit("openai", "gpt-5.4-mini", "a1").ok).toBe(true);
  });

  it("summarizes by day", () => {
    tracker.record({ provider: "openai", model: "x", accountId: "a", inputTokens: 10, outputTokens: 0 });
    const sum = tracker.summarize();
    const days = Object.keys(sum.byDay);
    expect(days.length).toBe(1);
    expect(days[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("calls persist hook on record", () => {
    const persist = vi.fn();
    const t = new QuotaTracker({ persist });
    t.record({ provider: "x", model: "y", accountId: "z", inputTokens: 0, outputTokens: 0 });
    expect(persist).toHaveBeenCalled();
  });
});
