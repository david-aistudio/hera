/**
 * web-search.ts
 *
 * Web search provider abstraction. Supports 9+ search providers.
 *
 * Source: open-sse/handlers/search/* (Tavily, Brave, Serper, Exa, SearXNG, Google PSE, Linkup, etc.)
 *
 * Usage:
 *   const search = new WebSearchRouter();
 *   search.registerProvider({ id: "tavily", apiKey: "tvly-..." });
 *   const results = await search.search("tavily", "AI agents 2026", { maxResults: 5 });
 */

export interface SearchProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  method: "GET" | "POST";
  format: "tavily" | "brave" | "serper" | "exa" | "searxng" | "google-pse" | "linkup" | "searchapi" | "youcom";
  authHeader?: string;             // "x-subscription-token" (Brave), "x-api-key" (Serper, Exa), "key" query (Google PSE)
  authPrefix?: string;
  noAuth?: boolean;                 // SearXNG can be no-auth
  costPerQuery?: number;            // for usage tracking
  freeMonthlyQuota?: number;
  searchTypes?: ("web" | "news")[];
}

export interface SearchRequest {
  query: string;
  maxResults?: number;              // 1-20
  type?: "web" | "news";
  // Provider-specific
  region?: string;                  // "us", "id", etc.
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];        // whitelist
  excludeDomains?: string[];        // blacklist
}

export interface SearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedDate?: string;
    score?: number;
  }>;
  cost?: number;
}

export const SEARCH_PROVIDER_CATALOG: Record<string, Omit<SearchProviderConfig, "apiKey">> = {
  tavily: { id: "tavily", baseUrl: "https://api.tavily.com/search", method: "POST", format: "tavily", authPrefix: "Bearer ", costPerQuery: 0.008, freeMonthlyQuota: 1000, searchTypes: ["web", "news"] },
  brave: { id: "brave", baseUrl: "https://api.search.brave.com/res/v1/web/search", method: "GET", format: "brave", authHeader: "x-subscription-token", costPerQuery: 0.005, freeMonthlyQuota: 1000, searchTypes: ["web", "news"] },
  serper: { id: "serper", baseUrl: "https://google.serper.dev/search", method: "POST", format: "serper", authHeader: "x-api-key", costPerQuery: 0.001, freeMonthlyQuota: 2500, searchTypes: ["web", "news"] },
  exa: { id: "exa", baseUrl: "https://api.exa.ai/search", method: "POST", format: "exa", authHeader: "x-api-key", costPerQuery: 0.007, freeMonthlyQuota: 1000, searchTypes: ["web", "news"] },
  searxng: { id: "searxng", baseUrl: "http://localhost:8888/search", method: "GET", format: "searxng", noAuth: true, costPerQuery: 0, freeMonthlyQuota: 999999, searchTypes: ["web", "news"] },
  "google-pse": { id: "google-pse", baseUrl: "https://www.googleapis.com/customsearch/v1", method: "GET", format: "google-pse", authHeader: "key", costPerQuery: 0.005, freeMonthlyQuota: 3000, searchTypes: ["web", "news"] },
  linkup: { id: "linkup", baseUrl: "https://api.linkup.so/v1/search", method: "POST", format: "linkup", authPrefix: "Bearer ", costPerQuery: 0.005, freeMonthlyQuota: 1000, searchTypes: ["web"] },
  searchapi: { id: "searchapi", baseUrl: "https://www.searchapi.io/api/v1/search", method: "GET", format: "searchapi", authHeader: "api_key", costPerQuery: 0.004, freeMonthlyQuota: 100, searchTypes: ["web", "news"] },
  youcom: { id: "youcom", baseUrl: "https://ydc-index.io/v1/search", method: "GET", format: "youcom", authHeader: "x-api-key", costPerQuery: 0.005, freeMonthlyQuota: 0, searchTypes: ["web", "news"] },
};

export class WebSearchRouter {
  private providers = new Map<string, SearchProviderConfig>();

  registerProvider(config: SearchProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async search(providerId: string, request: SearchRequest): Promise<SearchResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown search provider: ${providerId}`);

    const maxResults = request.maxResults ?? 5;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    let url = provider.baseUrl;
    let body: unknown;

    switch (provider.format) {
      case "tavily":
        body = { query: request.query, max_results: maxResults, include_news: request.type === "news", ...(request.includeDomains ? { include_domains: request.includeDomains } : {}), ...(request.excludeDomains ? { exclude_domains: request.excludeDomains } : {}) };
        break;
      case "brave":
        url = `${url}?q=${encodeURIComponent(request.query)}&count=${maxResults}`;
        break;
      case "serper":
        body = { q: request.query, num: maxResults };
        break;
      case "exa":
        body = { query: request.query, numResults: maxResults, type: "auto" };
        break;
      case "searxng":
        url = `${url}?q=${encodeURIComponent(request.query)}&format=json&count=${maxResults}`;
        break;
      case "google-pse":
        url = `${url}?key=${provider.apiKey}&cx=${request.region ?? "default"}&q=${encodeURIComponent(request.query)}&num=${maxResults}`;
        break;
      case "linkup":
        body = { query: request.query, maxResults, depth: "standard" };
        break;
      case "searchapi":
        url = `${url}?api_key=${provider.apiKey}&q=${encodeURIComponent(request.query)}&num=${maxResults}`;
        break;
      case "youcom":
        url = `${url}?query=${encodeURIComponent(request.query)}&count=${maxResults}`;
        break;
      default:
        throw new Error(`Unsupported search format: ${provider.format}`);
    }

    const res = await fetch(url, { method: provider.method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`Search ${providerId} ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json();
    return { query: request.query, results: this.parseResults(provider.format, data, maxResults), cost: provider.costPerQuery };
  }

  private parseResults(format: string, data: unknown, max: number): SearchResult["results"] {
    const d = data as Record<string, unknown>;
    switch (format) {
      case "tavily":
        return ((d.results as Array<{ title: string; url: string; content: string; published_date?: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.content, publishedDate: r.published_date }));
      case "brave":
        return (((d.web as Record<string, unknown>)?.results as Array<{ title: string; url: string; description: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
      case "serper":
        return ((d.organic as Array<{ title: string; link: string; snippet: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
      case "exa":
        return ((d.results as Array<{ title: string; url: string; text: string; score?: number }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.text.slice(0, 500), score: r.score }));
      case "searxng":
        return ((d.results as Array<{ title: string; url: string; content: string; publishedDate?: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.content, publishedDate: r.publishedDate }));
      case "google-pse":
        return ((d.items as Array<{ title: string; link: string; snippet: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
      case "linkup":
        return ((d.results as Array<{ title: string; url: string; content: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
      case "searchapi":
        return ((d.organic_results as Array<{ title: string; link: string; snippet: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
      case "youcom":
        return ((d.hits as Array<{ title: string; url: string; description: string }>) ?? []).slice(0, max).map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
      default:
        return [];
    }
  }
}
