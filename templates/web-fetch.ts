/**
 * web-fetch.ts
 *
 * Web fetch / scrape provider abstraction. Supports 4+ providers.
 *
 * Source: open-sse/handlers/fetch/* (Tavily, Exa, Firecrawl, Jina Reader)
 *
 * Usage:
 *   const fetch = new WebFetchRouter();
 *   fetch.registerProvider({ id: "firecrawl", apiKey: "fc-..." });
 *   const page = await fetch.fetch("firecrawl", "https://example.com");
 */

export interface FetchProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  method: "GET" | "POST";
  format: "tavily" | "exa" | "firecrawl" | "jina";
  authHeader?: string;             // "x-api-key" (Exa)
  authPrefix?: string;
  noAuth?: boolean;                 // jina has free tier
  formats?: ("markdown" | "text" | "html")[];
  maxCharacters?: number;
  costPerQuery?: number;
}

export interface FetchRequest {
  url: string;
  format?: "markdown" | "text" | "html";
  maxCharacters?: number;
}

export interface FetchResult {
  url: string;
  content: string;
  contentType: string;
  title?: string;
  description?: string;
  cost?: number;
}

export const FETCH_PROVIDER_CATALOG: Record<string, Omit<FetchProviderConfig, "apiKey">> = {
  tavily: { id: "tavily", baseUrl: "https://api.tavily.com/extract", method: "POST", format: "tavily", authPrefix: "Bearer ", formats: ["markdown", "text"], maxCharacters: 100000, costPerQuery: 0.008 },
  exa: { id: "exa", baseUrl: "https://api.exa.ai/contents", method: "POST", format: "exa", authHeader: "x-api-key", formats: ["text", "markdown"], maxCharacters: 100000, costPerQuery: 0.001 },
  firecrawl: { id: "firecrawl", baseUrl: "https://api.firecrawl.dev/v1/scrape", method: "POST", format: "firecrawl", authPrefix: "Bearer ", formats: ["markdown", "html", "text"], maxCharacters: 200000, costPerQuery: 0.002 },
  jina: { id: "jina", baseUrl: "https://r.jina.ai", method: "GET", format: "jina", authPrefix: "Bearer ", noAuth: false, formats: ["markdown", "text", "html"], maxCharacters: 200000, costPerQuery: 0 },
};

export class WebFetchRouter {
  private providers = new Map<string, FetchProviderConfig>();

  registerProvider(config: FetchProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async fetch(providerId: string, request: FetchRequest): Promise<FetchResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown fetch provider: ${providerId}`);

    const format = request.format ?? "markdown";
    const max = request.maxCharacters ?? provider.maxCharacters ?? 50000;
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/markdown, text/html, text/plain" };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    let url = provider.baseUrl;
    let body: unknown;

    switch (provider.format) {
      case "tavily":
        body = { urls: [request.url] };
        break;
      case "exa":
        body = { ids: [request.url], text: { maxCharacters: max } };
        break;
      case "firecrawl":
        body = { url: request.url, formats: [format] };
        break;
      case "jina":
        url = `${url}/${request.url}`;
        headers["X-Return-Format"] = format;
        break;
      default:
        throw new Error(`Unsupported fetch format: ${provider.format}`);
    }

    const res = await fetch(url, { method: provider.method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`Fetch ${providerId} ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = (await res.json()) as Record<string, unknown>;
    return this.parseResponse(provider.format, request.url, data, format, provider.costPerQuery);
  }

  private parseResponse(format: string, url: string, data: Record<string, unknown>, contentType: string, cost?: number): FetchResult {
    switch (format) {
      case "tavily":
        const tr = (data.results as Array<{ raw_content: string; url: string }>) ?? [];
        return { url: tr[0]?.url ?? url, content: tr[0]?.raw_content ?? "", contentType, cost };
      case "exa":
        return { url, content: ((data.results as Array<{ text: string }>) ?? [])[0]?.text ?? "", contentType, cost };
      case "firecrawl":
        const fc = data.data as { markdown?: string; html?: string; metadata?: { title?: string; description?: string } } | undefined;
        return { url, content: fc?.markdown ?? fc?.html ?? "", contentType, title: fc?.metadata?.title, description: fc?.metadata?.description, cost };
      case "jina":
        return { url, content: (data.data as string) ?? "", contentType, title: data.title as string | undefined, description: data.description as string | undefined, cost };
      default:
        return { url, content: "", contentType, cost };
    }
  }
}
