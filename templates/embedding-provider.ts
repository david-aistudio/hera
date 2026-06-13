/**
 * embedding-provider.ts
 *
 * Text embedding provider abstraction. Supports 8+ embedding providers.
 *
 * Source: open-sse/handlers/embeddingProviders/* (openai, voyage, mistral, jina, etc.)
 *
 * Usage:
 *   const emb = new EmbeddingRouter();
 *   emb.registerProvider({ id: "openai", apiKey: "sk-..." });
 *   const vectors = await emb.embed("openai", "text-embedding-3-small", ["hello", "world"]);
 */

export interface EmbeddingProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  format: "openai" | "voyage" | "mistral" | "jina" | "cohere" | "together" | "nebius" | "siliconflow" | "fireworks" | "huggingface" | "gemini";
  authHeader?: string;
  authPrefix?: string;
  noAuth?: boolean;
  defaultModel?: string;
  defaultDimensions?: number;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];         // single text or batch
  dimensions?: number;              // reduce embedding size (e.g. OpenAI 3-large supports 256/1024/3072)
  encodingFormat?: "float" | "base64";
  user?: string;                    // for abuse detection
}

export interface EmbeddingResult {
  embeddings: Array<{ index: number; embedding: number[]; object: "embedding" }>;
  model: string;
  usage: { promptTokens: number; totalTokens: number };
  cost?: number;
}

export const EMBEDDING_PROVIDER_CATALOG: Record<string, Omit<EmbeddingProviderConfig, "apiKey">> = {
  openai: { id: "openai", baseUrl: "https://api.openai.com/v1/embeddings", format: "openai", authPrefix: "Bearer ", defaultModel: "text-embedding-3-small", defaultDimensions: 1536 },
  voyage: { id: "voyage", baseUrl: "https://api.voyageai.com/v1/embeddings", format: "voyage", authPrefix: "Bearer ", defaultModel: "voyage-3.5", defaultDimensions: 1024 },
  mistral: { id: "mistral", baseUrl: "https://api.mistral.ai/v1/embeddings", format: "mistral", authPrefix: "Bearer ", defaultModel: "mistral-embed", defaultDimensions: 1024 },
  jina: { id: "jina", baseUrl: "https://api.jina.ai/v1/embeddings", format: "jina", authPrefix: "Bearer ", defaultModel: "jina-embeddings-v3", defaultDimensions: 1024 },
  cohere: { id: "cohere", baseUrl: "https://api.cohere.ai/v1/embed", format: "cohere", authPrefix: "Bearer ", defaultModel: "embed-english-v3.0", defaultDimensions: 1024 },
  together: { id: "together", baseUrl: "https://api.together.xyz/v1/embeddings", format: "together", authPrefix: "Bearer ", defaultModel: "BAAI/bge-large-en-v1.5", defaultDimensions: 1024 },
  nebius: { id: "nebius", baseUrl: "https://api.studio.nebius.ai/v1/embeddings", format: "nebius", authPrefix: "Bearer ", defaultModel: "Qwen/Qwen3-Embedding-8B", defaultDimensions: 4096 },
  siliconflow: { id: "siliconflow", baseUrl: "https://api.siliconflow.com/v1/embeddings", format: "siliconflow", authPrefix: "Bearer ", defaultModel: "BAAI/bge-m3" },
  fireworks: { id: "fireworks", baseUrl: "https://api.fireworks.ai/inference/v1/embeddings", format: "fireworks", authPrefix: "Bearer ", defaultModel: "nomic-ai/nomic-embed-text-v1.5", defaultDimensions: 768 },
  huggingface: { id: "huggingface", baseUrl: "https://api-inference.huggingface.co/models", format: "huggingface", authPrefix: "Bearer " },
  gemini: { id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", format: "gemini", defaultModel: "text-embedding-004", defaultDimensions: 768 },
};

export class EmbeddingRouter {
  private providers = new Map<string, EmbeddingProviderConfig>();

  registerProvider(config: EmbeddingProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async embed(providerId: string, modelOrRequest: string | EmbeddingRequest, input?: string | string[]): Promise<EmbeddingResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown embedding provider: ${providerId}`);

    const request: EmbeddingRequest = typeof modelOrRequest === "string" ? { model: modelOrRequest, input: input! } : modelOrRequest;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    let url = provider.baseUrl;
    let body: unknown;

    switch (provider.format) {
      case "openai":
      case "together":
      case "nebius":
      case "siliconflow":
      case "fireworks":
        body = { model: request.model, input: request.input, ...(request.encodingFormat ? { encoding_format: request.encodingFormat } : {}), ...(request.dimensions ? { dimensions: request.dimensions } : {}), ...(request.user ? { user: request.user } : {}) };
        break;
      case "voyage":
        body = { model: request.model, input: request.input, input_type: "document", ...(request.dimensions ? { output_dimension: request.dimensions } : {}) };
        break;
      case "mistral":
        body = { model: request.model, input: Array.isArray(request.input) ? request.input : [request.input] };
        break;
      case "jina":
        body = { model: request.model, input: request.input, ...(request.dimensions ? { dimensions: request.dimensions } : {}) };
        break;
      case "cohere":
        // Cohere has different endpoint shape
        url = provider.baseUrl;
        body = { model: request.model, texts: Array.isArray(request.input) ? request.input : [request.input], input_type: "search_document" };
        break;
      case "huggingface":
        url = `${provider.baseUrl}/${request.model}`;
        body = { inputs: request.input };
        break;
      case "gemini":
        url = `${provider.baseUrl}/${request.model}:batchEmbedContents?key=${provider.apiKey}`;
        const inputs = Array.isArray(request.input) ? request.input : [request.input];
        body = { requests: inputs.map((t) => ({ model: `models/${request.model}`, content: { parts: [{ text: t }] } })) };
        break;
      default:
        throw new Error(`Unsupported embedding format: ${provider.format}`);
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Embedding ${providerId} ${res.status}: ${(await res.text()).slice(0, 200)}`);

    return this.parseResponse(provider.format, request.model, await res.json());
  }

  private parseResponse(format: string, model: string, data: unknown): EmbeddingResult {
    const d = data as Record<string, unknown>;
    switch (format) {
      case "openai":
      case "together":
      case "nebius":
      case "siliconflow":
      case "fireworks":
        return {
          embeddings: ((d.data as Array<{ index: number; embedding: number[] }>) ?? []).map((e) => ({ index: e.index, embedding: e.embedding, object: "embedding" as const })),
          model,
          usage: { promptTokens: ((d.usage as Record<string, number>)?.prompt_tokens) ?? 0, totalTokens: ((d.usage as Record<string, number>)?.total_tokens) ?? 0 },
        };
      case "voyage":
        return {
          embeddings: ((d.data as Array<{ index: number; embedding: number[] }>) ?? []).map((e) => ({ index: e.index, embedding: e.embedding, object: "embedding" as const })),
          model,
          usage: { promptTokens: ((d.usage as Record<string, number>)?.total_tokens) ?? 0, totalTokens: ((d.usage as Record<string, number>)?.total_tokens) ?? 0 },
        };
      case "mistral":
      case "jina":
        return {
          embeddings: ((d.data as Array<{ index: number; embedding: number[] }>) ?? []).map((e) => ({ index: e.index, embedding: e.embedding, object: "embedding" as const })),
          model,
          usage: { promptTokens: 0, totalTokens: ((d.usage as Record<string, number>)?.total_tokens) ?? 0 },
        };
      case "cohere":
        return {
          embeddings: ((d.embeddings as Array<{ index: number; embedding: number[] }>) ?? []).map((e) => ({ index: e.index, embedding: e.embedding, object: "embedding" as const })),
          model,
          usage: { promptTokens: 0, totalTokens: 0 },
        };
      case "huggingface":
        // HF returns array of arrays (or array of {embedding: []})
        if (Array.isArray(data) && Array.isArray(data[0])) {
          return { embeddings: (data as number[][]).map((e, i) => ({ index: i, embedding: e, object: "embedding" as const })), model, usage: { promptTokens: 0, totalTokens: 0 } };
        }
        return { embeddings: [], model, usage: { promptTokens: 0, totalTokens: 0 } };
      case "gemini":
        return {
          embeddings: ((d.embeddings as Array<{ values: number[] }>) ?? []).map((e, i) => ({ index: i, embedding: e.values, object: "embedding" as const })),
          model,
          usage: { promptTokens: 0, totalTokens: 0 },
        };
      default:
        return { embeddings: [], model, usage: { promptTokens: 0, totalTokens: 0 } };
    }
  }
}
