import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MultiProviderRouter,
  PROVIDER_CATALOG,
  FORMATS,
  detectFormat,
  type ChatRequest,
} from "../../templates/multi-provider-router.js";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe("MultiProviderRouter", () => {
  let router: MultiProviderRouter;

  beforeEach(() => {
    mockFetch.mockReset();
    router = new MultiProviderRouter();
  });

  describe("provider registration", () => {
    it("registers a custom provider", () => {
      router.registerProvider({
        id: "my-llm",
        baseUrl: "https://my-llm.example.com/v1/chat/completions",
        format: FORMATS.OPENAI,
        apiKey: "test-key",
      });
      expect(router.listProviders()).toContain("my-llm");
    });

    it("rejects duplicate provider registration", () => {
      router.registerProvider({ id: "x", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" });
      expect(() => router.registerProvider({ id: "x", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" })).toThrow(
        /already registered/,
      );
    });

    it("removes a provider", () => {
      router.registerProvider({ id: "x", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" });
      expect(router.removeProvider("x")).toBe(true);
      expect(router.listProviders()).not.toContain("x");
    });

    it("supports custom (non-catalog) providers", () => {
      router.registerProvider({
        id: "local-llama",
        baseUrl: "http://10.0.0.5:8080/v1/chat/completions",
        format: FORMATS.OPENAI,
        apiKey: "unused",
        isCustom: true,
      });
      const state = router.getProvider("local-llama");
      expect(state?.config.isCustom).toBe(true);
    });
  });

  describe("account management", () => {
    it("supports multi-key pool per provider", () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k1" });
      router.addAccount("p", "k2");
      router.addAccount("p", "k3");
      const state = router.getProvider("p");
      expect(state?.accounts.length).toBe(3);
    });
  });

  describe("format detection", () => {
    it("detects OpenAI Responses from /v1/responses", () => {
      expect(detectFormat("/v1/responses")).toBe(FORMATS.OPENAI_RESPONSES);
    });
    it("detects Claude from /v1/messages", () => {
      expect(detectFormat("/v1/messages")).toBe(FORMATS.CLAUDE);
    });
    it("detects OpenAI from /v1/chat/completions with input[]", () => {
      expect(detectFormat("/v1/chat/completions", { input: [] })).toBe(FORMATS.OPENAI);
    });
    it("returns null for unknown paths", () => {
      expect(detectFormat("/unknown")).toBeNull();
    });
  });

  describe("format translation", () => {
    it("translates OpenAI to Claude", () => {
      // Hack: invoke via internal translator registry
      const req = {
        model: "claude-3",
        messages: [
          { role: "system", content: "you are helpful" },
          { role: "user", content: "hi" },
        ],
        max_tokens: 100,
      };
      // Reuse the registered translator: invoke chat with Claude provider
      router.registerProvider({
        id: "anthropic-test",
        baseUrl: "https://api.anthropic.com/v1/messages",
        format: FORMATS.CLAUDE,
        apiKey: "k",
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: "hello" }] }),
      });
      return router.chat("anthropic-test", req as ChatRequest).then(() => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.system).toBe("you are helpful");
        expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
        expect(body.max_tokens).toBe(100);
      });
    });

    it("translates OpenAI to Gemini", async () => {
      router.registerProvider({
        id: "gemini-test",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
        format: FORMATS.GEMINI,
        apiKey: "k",
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [] }),
      });
      await router.chat("gemini-test", {
        model: "gemini-1.5",
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hello" },
        ],
      } as ChatRequest);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.systemInstruction.parts[0].text).toBe("be brief");
      expect(body.contents[0].role).toBe("user");
      expect(body.contents[0].parts[0].text).toBe("hello");
    });
  });

  describe("auth headers", () => {
    it("uses Bearer by default", async () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "sk-123" });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await router.chat("p", { model: "m", messages: [] } as ChatRequest);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe("Bearer sk-123");
    });

    it("uses custom authHeader when set", async () => {
      router.registerProvider({
        id: "p",
        baseUrl: "u",
        format: FORMATS.OPENAI,
        apiKey: "key-xyz",
        authHeader: "x-api-key",
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await router.chat("p", { model: "m", messages: [] } as ChatRequest);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["x-api-key"]).toBe("key-xyz");
      expect(headers.Authorization).toBeUndefined();
    });

    it("omits auth when noAuth=true", async () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k", noAuth: true });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await router.chat("p", { model: "m", messages: [] } as ChatRequest);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe("custom provider registration", () => {
    it("accepts custom headers (spoofing)", async () => {
      router.registerProvider({
        id: "spoof",
        baseUrl: "u",
        format: FORMATS.OPENAI,
        apiKey: "k",
        headers: { "X-Custom-Client": "my-cli/1.0" },
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await router.chat("spoof", { model: "m", messages: [] } as ChatRequest);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["X-Custom-Client"]).toBe("my-cli/1.0");
    });

    it("supports baseUrls array (edge failover)", () => {
      router.registerProvider({
        id: "multi",
        baseUrl: "https://primary.example.com",
        baseUrls: ["https://primary.example.com", "https://fallback.example.com"],
        format: FORMATS.OPENAI,
        apiKey: "k",
      });
      const state = router.getProvider("multi");
      expect(state?.config.baseUrls?.length).toBe(2);
    });
  });

  describe("error rules + cooldown", () => {
    it("cooldown account on 429", async () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" });
      await expect(
        router.chat("p", { model: "m", messages: [] } as ChatRequest),
      ).rejects.toThrow();
      const account = router.getProvider("p")!.accounts[0];
      expect(account.rateLimitedUntil).toBeGreaterThan(Date.now());
    });

    it("matches text-based error rules", async () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "quota exceeded" });
      await expect(
        router.chat("p", { model: "m", messages: [] } as ChatRequest),
      ).rejects.toThrow();
      const account = router.getProvider("p")!.accounts[0];
      expect(account.rateLimitedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe("usage tracking", () => {
    it("records success and failure", async () => {
      router.registerProvider({ id: "p", baseUrl: "u", format: FORMATS.OPENAI, apiKey: "k" });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await router.chat("p", { model: "m", messages: [] } as ChatRequest);
      const usage = router.getUsage();
      expect(usage.recent().length).toBe(1);
      expect(usage.recent()[0].success).toBe(true);
      expect(usage.byProvider().p.calls).toBe(1);
    });
  });

  describe("PROVIDER_CATALOG", () => {
    it("includes common OpenAI-compat providers", () => {
      expect(PROVIDER_CATALOG.openai).toBeDefined();
      expect(PROVIDER_CATALOG.anthropic).toBeDefined();
      expect(PROVIDER_CATALOG.groq).toBeDefined();
      expect(PROVIDER_CATALOG.openrouter).toBeDefined();
      expect(PROVIDER_CATALOG.ollama).toBeDefined();
      expect(PROVIDER_CATALOG.deepseek).toBeDefined();
    });

    it("all catalog entries have valid format", () => {
      for (const [_id, p] of Object.entries(PROVIDER_CATALOG)) {
        expect(["openai", "claude", "gemini", "openai-responses"]).toContain(p.format);
        expect(p.baseUrl).toMatch(/^https?:\/\//);
      }
    });
  });
});
