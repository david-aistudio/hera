import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TTSRouter,
  TTS_PROVIDER_CATALOG,
  type TTSRequest,
} from "../../templates/tts-provider.js";
import {
  STTRouter,
  STT_PROVIDER_CATALOG,
} from "../../templates/stt-provider.js";
import {
  ImageRouter,
  IMAGE_PROVIDER_CATALOG,
} from "../../templates/image-provider.js";
import {
  WebSearchRouter,
  SEARCH_PROVIDER_CATALOG,
} from "../../templates/web-search.js";
import {
  WebFetchRouter,
  FETCH_PROVIDER_CATALOG,
} from "../../templates/web-fetch.js";
import {
  EmbeddingRouter,
  EMBEDDING_PROVIDER_CATALOG,
} from "../../templates/embedding-provider.js";
import {
  toOpenAIParts,
  toClaudeContent,
  toGeminiParts,
  toResponsesParts,
  extractText,
  stripContent,
  inferMimeType,
  isDataUrl,
  parseDataUrl,
  detectContentKinds,
} from "../../templates/multimodal-input.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

// ============================================================
// MULTIMODAL INPUT
// ============================================================
describe("multimodal-input", () => {
  it("normalizes string to text part", () => {
    expect(toOpenAIParts("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("extracts text from mixed content", () => {
    const parts = toOpenAIParts([
      { type: "text", text: "describe: " },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      { type: "text", text: "thanks" },
    ]);
    expect(extractText(parts)).toBe("describe: thanks");
  });

  it("infers MIME types", () => {
    expect(inferMimeType("https://x.com/a.png")).toBe("image/png");
    expect(inferMimeType("https://x.com/a.mp3")).toBe("audio/mpeg");
    expect(inferMimeType("data:audio/wav;base64,abc")).toBe("audio/wav");
  });

  it("detects data URLs", () => {
    expect(isDataUrl("data:image/png;base64,abc")).toBe(true);
    expect(isDataUrl("https://x.com")).toBe(false);
  });

  it("parses data URLs", () => {
    expect(parseDataUrl("data:image/png;base64,abc123")).toEqual({ mimeType: "image/png", data: "abc123" });
    expect(parseDataUrl("https://x.com")).toBeNull();
  });

  it("converts to Claude blocks (base64 image)", () => {
    const blocks = toClaudeContent([{ type: "image_url", image_url: { url: "data:image/png;base64,XYZ" } }]);
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].source?.type).toBe("base64");
    expect(blocks[0].source?.media_type).toBe("image/png");
  });

  it("converts to Claude blocks (URL image)", () => {
    const blocks = toClaudeContent([{ type: "image_url", image_url: { url: "https://x.com/cat.jpg" } }]);
    expect(blocks[0].source?.type).toBe("url");
    expect((blocks[0].source?.data as { url: string }).url).toBe("https://x.com/cat.jpg");
  });

  it("converts to Gemini parts (inline data)", () => {
    const parts = toGeminiParts([{ type: "image_url", image_url: { url: "data:image/jpeg;base64,ABC" } }]);
    expect(parts[0].inlineData?.mime_type).toBe("image/jpeg");
    expect(parts[0].inlineData?.data).toBe("ABC");
  });

  it("converts to Gemini parts (file data for URL)", () => {
    const parts = toGeminiParts([{ type: "image_url", image_url: { url: "https://x.com/cat.jpg" } }]);
    expect(parts[0].fileData?.fileUri).toBe("https://x.com/cat.jpg");
  });

  it("converts to Responses API parts", () => {
    const parts = toResponsesParts([
      { type: "text", text: "hi" },
      { type: "image_url", image_url: { url: "data:..." } },
    ]);
    expect(parts[0].type).toBe("input_text");
    expect(parts[1].type).toBe("input_image");
  });

  it("strips content by type", () => {
    const content = [
      { type: "text" as const, text: "look" },
      { type: "image_url" as const, image_url: { url: "data:..." } },
      { type: "input_audio" as const, input_audio: { data: "abc", format: "wav" as const } },
    ];
    const stripped = stripContent(content, ["image", "audio"]);
    expect(stripContent).toBeDefined();
    const result = stripped as Array<{ type: string }>;
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("text");
  });

  it("detects content kinds", () => {
    const kinds = detectContentKinds([
      { type: "text", text: "x" },
      { type: "image_url", image_url: { url: "data:..." } },
    ]);
    expect(kinds.hasText).toBe(true);
    expect(kinds.hasImage).toBe(true);
    expect(kinds.hasAudio).toBe(false);
  });
});

// ============================================================
// TTS
// ============================================================
describe("TTSRouter", () => {
  let tts: TTSRouter;
  beforeEach(() => { tts = new TTSRouter(); });

  it("registers and lists providers", () => {
    tts.registerProvider({ ...TTS_PROVIDER_CATALOG.openai, apiKey: "k" });
    expect(tts.listProviders()).toContain("openai");
  });

  it("synthesizes with OpenAI format", async () => {
    tts.registerProvider({ ...TTS_PROVIDER_CATALOG.openai, apiKey: "sk-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    const result = await tts.synthesize("openai", {
      model: "tts-1",
      input: "hi",
      voice: "alloy",
    } as TTSRequest);
    expect(result.contentType).toBe("audio/mpeg");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("tts-1");
    expect(body.voice).toBe("alloy");
    expect(body.input).toBe("hi");
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-1");
  });

  it("uses ElevenLabs voice in URL", async () => {
    tts.registerProvider({ ...TTS_PROVIDER_CATALOG.elevenlabs, apiKey: "el-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    await tts.synthesize("elevenlabs", { model: "eleven_multilingual_v2", input: "hi", voice: "21m00Tcm4TlvDq8ikWAM" } as TTSRequest);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/21m00Tcm4TlvDq8ikWAM");
    expect(mockFetch.mock.calls[0][1].headers["xi-api-key"]).toBe("el-1");
  });

  it("returns built-in voice catalog", () => {
    expect(tts.getVoices("openai").length).toBeGreaterThan(0);
    expect(tts.getVoices("elevenlabs").length).toBeGreaterThan(0);
  });

  it("throws on unknown provider", async () => {
    await expect(tts.synthesize("unknown", { model: "x", input: "x", voice: "x" } as TTSRequest)).rejects.toThrow();
  });
});

// ============================================================
// STT
// ============================================================
describe("STTRouter", () => {
  let stt: STTRouter;
  beforeEach(() => { stt = new STTRouter(); });

  it("transcribes with OpenAI format", async () => {
    stt.registerProvider({ ...STT_PROVIDER_CATALOG.openai, apiKey: "sk-1" });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ text: "hello world" }) });
    const buf = Buffer.from([1, 2, 3]);
    const result = await stt.transcribe("openai", { model: "whisper-1", audio: buf });
    expect(result.text).toBe("hello world");
  });

  it("transcribes with Deepgram", async () => {
    stt.registerProvider({ ...STT_PROVIDER_CATALOG.deepgram, apiKey: "dg-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { channels: [{ alternatives: [{ transcript: "deep hello", words: [] }] }] },
      }),
    });
    const buf = Buffer.from([1, 2, 3]);
    const result = await stt.transcribe("deepgram", { model: "nova-3", audio: buf });
    expect(result.text).toBe("deep hello");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("model=nova-3");
  });
});

// ============================================================
// IMAGE
// ============================================================
describe("ImageRouter", () => {
  let img: ImageRouter;
  beforeEach(() => { img = new ImageRouter(); });

  it("generates with OpenAI format", async () => {
    img.registerProvider({ ...IMAGE_PROVIDER_CATALOG.openai, apiKey: "sk-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ url: "https://x.com/img.png", revised_prompt: "a cat" }] }),
    });
    const result = await img.generate("openai", { model: "dall-e-3", prompt: "cat" });
    expect(result.images[0].url).toBe("https://x.com/img.png");
  });

  it("generates with Gemini (responseModalities)", async () => {
    img.registerProvider({ ...IMAGE_PROVIDER_CATALOG.gemini, apiKey: "g-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { data: "BASE64", mimeType: "image/png" } }] } }],
      }),
    });
    const result = await img.generate("gemini", { model: "gemini-2.5-flash-image", prompt: "cat" });
    expect(result.images[0].b64_json).toBe("BASE64");
  });

  it("generates with Stability AI", async () => {
    img.registerProvider({ ...IMAGE_PROVIDER_CATALOG.stability, apiKey: "st-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ artifacts: [{ base64: "STABILITY" }] }),
    });
    const result = await img.generate("stability", { model: "stable-image-core", prompt: "cat" });
    expect(result.images[0].b64_json).toBe("STABILITY");
  });
});

// ============================================================
// WEB SEARCH
// ============================================================
describe("WebSearchRouter", () => {
  let search: WebSearchRouter;
  beforeEach(() => { search = new WebSearchRouter(); });

  it("searches with Tavily (POST)", async () => {
    search.registerProvider({ ...SEARCH_PROVIDER_CATALOG.tavily, apiKey: "tvly-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ title: "AI", url: "https://a.com", content: "snippet", published_date: "2026-01-01" }],
      }),
    });
    const result = await search.search("tavily", { query: "AI", maxResults: 3 });
    expect(result.results[0].title).toBe("AI");
    expect(result.results[0].publishedDate).toBe("2026-01-01");
    expect(result.cost).toBe(0.008);
  });

  it("searches with Brave (GET)", async () => {
    search.registerProvider({ ...SEARCH_PROVIDER_CATALOG.brave, apiKey: "br-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [{ title: "B", url: "https://b.com", description: "d" }] } }),
    });
    const result = await search.search("brave", { query: "test" });
    expect(result.results[0].title).toBe("B");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("q=test");
  });

  it("searches with SearXNG (no auth)", async () => {
    search.registerProvider({ ...SEARCH_PROVIDER_CATALOG.searxng, apiKey: "" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ title: "S", url: "https://s.com", content: "c" }] }),
    });
    const result = await search.search("searxng", { query: "test" });
    expect(result.results[0].title).toBe("S");
  });
});

// ============================================================
// WEB FETCH
// ============================================================
describe("WebFetchRouter", () => {
  let f: WebFetchRouter;
  beforeEach(() => { f = new WebFetchRouter(); });

  it("fetches with Firecrawl", async () => {
    f.registerProvider({ ...FETCH_PROVIDER_CATALOG.firecrawl, apiKey: "fc-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { markdown: "# Hi", metadata: { title: "T", description: "D" } },
      }),
    });
    const result = await f.fetch("firecrawl", { url: "https://x.com" });
    expect(result.title).toBe("T");
    expect(result.content).toBe("# Hi");
    expect(result.cost).toBe(0.002);
  });

  it("fetches with Jina (GET)", async () => {
    f.registerProvider({ ...FETCH_PROVIDER_CATALOG.jina, apiKey: "" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "JINA CONTENT", title: "JT" }),
    });
    const result = await f.fetch("jina", { url: "https://x.com" });
    expect(result.content).toBe("JINA CONTENT");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("https://x.com");
  });
});

// ============================================================
// EMBEDDING
// ============================================================
describe("EmbeddingRouter", () => {
  let e: EmbeddingRouter;
  beforeEach(() => { e = new EmbeddingRouter(); });

  it("embeds with OpenAI", async () => {
    e.registerProvider({ ...EMBEDDING_PROVIDER_CATALOG.openai, apiKey: "sk-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2, 0.3] },
          { index: 1, embedding: [0.4, 0.5, 0.6] },
        ],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });
    const result = await e.embed("openai", "text-embedding-3-small", ["hello", "world"]);
    expect(result.embeddings.length).toBe(2);
    expect(result.embeddings[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.usage.totalTokens).toBe(5);
  });

  it("embeds with Voyage (different field names)", async () => {
    e.registerProvider({ ...EMBEDDING_PROVIDER_CATALOG.voyage, apiKey: "vy-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ index: 0, embedding: [0.7, 0.8] }],
        usage: { total_tokens: 3 },
      }),
    });
    const result = await e.embed("voyage", "voyage-3.5", "hello");
    expect(result.embeddings[0].embedding).toEqual([0.7, 0.8]);
  });

  it("embeds with Gemini (batchEmbedContents)", async () => {
    e.registerProvider({ ...EMBEDDING_PROVIDER_CATALOG.gemini, apiKey: "g-1" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [{ values: [0.9, 0.8, 0.7] }] }),
    });
    const result = await e.embed("gemini", "text-embedding-004", "test");
    expect(result.embeddings[0].embedding).toEqual([0.9, 0.8, 0.7]);
  });
});
