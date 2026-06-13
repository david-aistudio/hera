import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MultiProviderRouter,
  type ModelEntry,
} from "../../templates/multi-provider-router.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe("Model registry", () => {
  let router: MultiProviderRouter;
  beforeEach(() => {
    mockFetch.mockReset();
    router = new MultiProviderRouter();
    router.registerProvider({
      id: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      format: "openai",
      apiKey: "k",
    });
  });

  it("registerModel adds a model to a provider", () => {
    router.registerModel("openai", { id: "gpt-5.4", name: "GPT-5.4" });
    const models = router.getProviderModels("openai");
    expect(models.length).toBe(1);
    expect(models[0].id).toBe("gpt-5.4");
  });

  it("registerModel replaces existing model with same id", () => {
    router.registerModel("openai", { id: "gpt-5.4", name: "Old" });
    router.registerModel("openai", { id: "gpt-5.4", name: "New" });
    expect(router.getProviderModels("openai").length).toBe(1);
    expect(router.getProviderModels("openai")[0].name).toBe("New");
  });

  it("isValidModel returns true for registered models", () => {
    router.registerModel("openai", { id: "gpt-5.4", name: "GPT-5.4" });
    expect(router.isValidModel("openai", "gpt-5.4")).toBe(true);
    expect(router.isValidModel("openai", "unknown-model")).toBe(false);
  });

  it("isValidModel returns true for any model when passthrough=true", () => {
    expect(router.isValidModel("openai", "anything-goes", true)).toBe(true);
  });

  it("getDefaultModel returns first registered model", () => {
    router.registerModel("openai", { id: "first", name: "First" });
    router.registerModel("openai", { id: "second", name: "Second" });
    expect(router.getDefaultModel("openai")).toBe("first");
  });

  it("getModelEntry returns full metadata", () => {
    const entry: ModelEntry = {
      id: "test",
      name: "Test",
      type: "llm",
      capabilities: ["chat"],
      params: ["temperature"],
      targetFormat: "claude",
      upstreamModelId: "upstream-test",
      quotaFamily: "review",
      strip: ["image", "audio"],
      contextLength: 128000,
    };
    router.registerModel("openai", entry);
    expect(router.getModelEntry("openai", "test")).toEqual(entry);
  });

  it("getModelTargetFormat returns override format", () => {
    router.registerModel("openai", { id: "x", name: "x", targetFormat: "claude" });
    expect(router.getModelTargetFormat("openai", "x")).toBe("claude");
  });

  it("getModelUpstreamId returns alias when set", () => {
    router.registerModel("openai", { id: "alias", name: "a", upstreamModelId: "real-id" });
    expect(router.getModelUpstreamId("openai", "alias")).toBe("real-id");
  });

  it("getModelUpstreamId returns model id when no alias", () => {
    router.registerModel("openai", { id: "plain", name: "p" });
    expect(router.getModelUpstreamId("openai", "plain")).toBe("plain");
  });

  it("getModelStrip returns content types to strip", () => {
    router.registerModel("openai", { id: "x", name: "x", strip: ["image", "audio"] });
    expect(router.getModelStrip("openai", "x")).toEqual(["image", "audio"]);
  });
});

describe("Live model fetching", () => {
  let router: MultiProviderRouter;
  beforeEach(() => {
    mockFetch.mockReset();
    router = new MultiProviderRouter();
    router.registerProvider({
      id: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      format: "openai",
      apiKey: "sk-test",
    });
  });

  it("fetches and parses /v1/models response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-5.4", name: "GPT-5.4" },
          { id: "text-embedding-3-small", name: "Text Embedding 3 Small" },
        ],
      }),
    });
    const models = await router.fetchLiveModels("openai");
    expect(models.length).toBe(2);
    expect(models[0]).toEqual({ id: "gpt-5.4", name: "GPT-5.4", type: "llm" });
    expect(models[1].type).toBe("embedding");
  });

  it("handles alternative response shape { models: [] }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ id: "custom-model", name: "Custom" }],
      }),
    });
    const models = await router.fetchLiveModels("openai");
    expect(models[0].id).toBe("custom-model");
  });

  it("returns empty array on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const models = await router.fetchLiveModels("openai");
    expect(models).toEqual([]);
  });

  it("strips /chat/completions suffix from baseUrl", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "x" }] }),
    });
    await router.fetchLiveModels("openai");
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe("https://api.openai.com/v1/models");
  });

  it("strips /messages suffix from baseUrl", async () => {
    router.registerProvider({
      id: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      format: "claude",
      apiKey: "sk-test",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "claude-sonnet-4-6", name: "Sonnet 4.6" }] }),
    });
    await router.fetchLiveModels("anthropic");
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe("https://api.anthropic.com/v1/models");
  });

  it("uses Bearer auth by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await router.fetchLiveModels("openai");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer sk-test");
  });

  it("uses custom authHeader when set", async () => {
    router.registerProvider({
      id: "enally",
      baseUrl: "https://ai.enally.in/v1/chat/completions",
      format: "openai",
      apiKey: "key-123",
      authHeader: "x-api-key",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await router.fetchLiveModels("enally");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("key-123");
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws for unknown provider", async () => {
    await expect(router.fetchLiveModels("nonexistent")).rejects.toThrow(/Unknown provider/);
  });
});

describe("Real 9router model catalog", () => {
  it("Antigravity does NOT include Sonnet 3.5", () => {
    // Sanity check: real Antigravity models from 9router providerModels.js
    const antigravityModels: ModelEntry[] = [
      { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)" },
      { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium)" },
      { id: "gemini-3.5-flash-extra-low", name: "Gemini 3.5 Flash (Low)" },
      { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)" },
      { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
      { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
      { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", thinking: false },
    ];

    const router = new MultiProviderRouter();
    router.registerProvider({
      id: "antigravity",
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      format: "openai",
      apiKey: "k",
    });
    antigravityModels.forEach((m) => router.registerModel("antigravity", m));

    // Sonnet 3.5 should NOT be in the catalog
    expect(router.isValidModel("antigravity", "claude-3-5-sonnet-20241022")).toBe(false);
    expect(router.isValidModel("antigravity", "claude-3-5-sonnet")).toBe(false);
    // Real Antigravity models should be valid
    expect(router.isValidModel("antigravity", "claude-sonnet-4-6")).toBe(true);
    expect(router.isValidModel("antigravity", "gemini-3-flash-agent")).toBe(true);
  });

  it("Anthropic API key provider DOES include Sonnet 3.5", () => {
    const router = new MultiProviderRouter();
    router.registerProvider({
      id: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      format: "claude",
      apiKey: "k",
    });
    // Real Anthropic models from 9router
    router.registerModel("anthropic", { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" });
    router.registerModel("anthropic", { id: "claude-opus-4-20250514", name: "Claude Opus 4" });
    router.registerModel("anthropic", { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" });

    // Sonnet 3.5 IS in Anthropic (API key provider)
    expect(router.isValidModel("anthropic", "claude-3-5-sonnet-20241022")).toBe(true);
  });

  it("OpenCode Go Xiaomi models have targetFormat=claude", () => {
    const router = new MultiProviderRouter();
    router.registerProvider({
      id: "opencode-go",
      baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
      format: "openai",
      apiKey: "k",
    });
    router.registerModel("opencode-go", {
      id: "minimax-m2.7",
      name: "MiniMax M2.7",
      targetFormat: "claude",
    });
    expect(router.getModelTargetFormat("opencode-go", "minimax-m2.7")).toBe("claude");
  });
});
