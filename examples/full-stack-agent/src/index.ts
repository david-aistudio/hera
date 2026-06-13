// src/index.ts — Full-Stack AI Agent — Main Entry
// Run with: npm start (after `export OPENAI_API_KEY=...`)

import { MultiProviderRouter } from "../../../templates/multi-provider-router.js";
import { TTSRouter } from "../../../templates/tts-provider.js";
import { STTRouter } from "../../../templates/stt-provider.js";
import { ImageRouter } from "../../../templates/image-provider.js";
import { WebSearchRouter } from "../../../templates/web-search.js";
import { WebFetchRouter } from "../../../templates/web-fetch.js";
import { EmbeddingRouter } from "../../../templates/embedding-provider.js";
import { QuotaTracker } from "../../../templates/quota-tracker.js";

// === Bootstrap providers from env ===
function envOrFail(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}. Set it before running.`);
    process.exit(1);
  }
  return v;
}

const llm = new MultiProviderRouter();
if (process.env.OPENAI_API_KEY) {
  llm.registerProvider({ id: "openai", baseUrl: "https://api.openai.com/v1/chat/completions", format: "openai", apiKey: process.env.OPENAI_API_KEY });
}
if (process.env.ANTHROPIC_API_KEY) {
  llm.registerProvider({ id: "anthropic", baseUrl: "https://api.anthropic.com/v1/messages", format: "claude", apiKey: process.env.ANTHROPIC_API_KEY });
}
if (process.env.GEMINI_API_KEY) {
  llm.registerProvider({ id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", format: "gemini", apiKey: process.env.GEMINI_API_KEY });
}

const tts = new TTSRouter();
if (process.env.OPENAI_API_KEY) {
  tts.registerProvider({ id: "openai", baseUrl: "https://api.openai.com/v1/audio/speech", format: "openai", apiKey: process.env.OPENAI_API_KEY, defaultModel: "tts-1", defaultVoice: "alloy", authPrefix: "Bearer " });
}

const stt = new STTRouter();
if (process.env.OPENAI_API_KEY) {
  stt.registerProvider({ id: "openai", baseUrl: "https://api.openai.com/v1/audio/transcriptions", format: "openai", apiKey: process.env.OPENAI_API_KEY });
}

const image = new ImageRouter();
if (process.env.OPENAI_API_KEY) {
  image.registerProvider({ id: "openai", baseUrl: "https://api.openai.com/v1/images/generations", format: "openai", apiKey: process.env.OPENAI_API_KEY, authPrefix: "Bearer " });
}

const search = new WebSearchRouter();
if (process.env.TAVILY_API_KEY) {
  search.registerProvider({ id: "tavily", baseUrl: "https://api.tavily.com/search", method: "POST", format: "tavily", apiKey: process.env.TAVILY_API_KEY, authPrefix: "Bearer " });
}

const fetch = new WebFetchRouter();
if (process.env.FIRECRAWL_API_KEY) {
  fetch.registerProvider({ id: "firecrawl", baseUrl: "https://api.firecrawl.dev/v1/scrape", method: "POST", format: "firecrawl", apiKey: process.env.FIRECRAWL_API_KEY, authPrefix: "Bearer " });
}

const embed = new EmbeddingRouter();
if (process.env.OPENAI_API_KEY) {
  embed.registerProvider({ id: "openai", baseUrl: "https://api.openai.com/v1/embeddings", format: "openai", apiKey: process.env.OPENAI_API_KEY, authPrefix: "Bearer ", defaultModel: "text-embedding-3-small" });
}

const quota = new QuotaTracker({
  limits: [
    { provider: "openai", maxRequestsPerMinute: 60, maxCostPerDay: 10 },
    { provider: "anthropic", maxRequestsPerMinute: 60, maxCostPerDay: 10 },
  ],
});

// === Demo: full-stack workflow ===
async function demo(): Promise<void> {
  console.log("=== Full-Stack AI Agent Demo ===\n");

  // 1. Web search
  if (search.listProviders().includes("tavily")) {
    console.log("🔍 Searching for latest AI news...");
    const results = await search.search("tavily", { query: "AI agents 2026", maxResults: 3 });
    for (const r of results.results) {
      console.log(`  • ${r.title} (${r.url})`);
    }
    console.log();
  }

  // 2. Fetch first result
  if (fetch.listProviders().includes("firecrawl") && search.listProviders().includes("tavily")) {
    const results = await search.search("tavily", { query: "Hera framework AI agent", maxResults: 1 });
    if (results.results[0]) {
      console.log(`📄 Fetching: ${results.results[0].url}`);
      const page = await fetch.fetch("firecrawl", { url: results.results[0].url });
      console.log(`  Title: ${page.title ?? "(no title)"}`);
      console.log(`  Content: ${page.content.slice(0, 200)}...`);
      console.log();
    }
  }

  // 3. LLM reasoning
  if (llm.listProviders().length > 0) {
    const providerId = llm.listProviders()[0];
    console.log(`💬 Chatting with ${providerId}...`);
    const reply = await llm.chat(providerId, {
      model: "gpt-5.4",
      messages: [
        { role: "system", content: "You are a helpful assistant. Be concise." },
        { role: "user", content: "Say hello in 3 different languages." },
      ],
    });
    console.log("  Reply:", JSON.stringify(reply).slice(0, 200));
    console.log();
  }

  // 4. Quota summary
  console.log("📊 Quota summary:");
  console.log(JSON.stringify(quota.summarize(), null, 2));
}

demo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});

export { llm, tts, stt, image, search, fetch, embed, quota };
