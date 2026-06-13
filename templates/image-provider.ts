/**
 * image-provider.ts
 *
 * Image generation provider abstraction. Supports 12+ image providers.
 *
 * Source: open-sse/handlers/imageGenerationCore.js
 *
 * Usage:
 *   const img = new ImageRouter();
 *   img.registerProvider({ id: "openai", apiKey: "sk-..." });
 *   const result = await img.generate("openai", "dall-e-3", "A cat", { size: "1024x1024" });
 */

export interface ImageProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  format: "openai" | "gemini" | "fal" | "stability" | "bfl" | "recraft" | "runway" | "nanobanana" | "comfyui" | "sdwebui" | "huggingface" | "vertex" | "bedrock";
  authHeader?: string;
  authPrefix?: string;
  noAuth?: boolean;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  size?: string;                   // "1024x1024", "1024x1792", "1792x1024", "512x512", "1024x768", etc.
  quality?: "standard" | "hd" | "auto";
  style?: "vivid" | "natural";
  n?: number;                       // number of images (1-10)
  responseFormat?: "url" | "b64_json";
  // Image-to-image / edit
  image?: string | Buffer;          // input image (URL or base64/data URL)
  mask?: string | Buffer;           // mask for inpainting
  seed?: number;
  // Provider-specific
  providerSpecificData?: Record<string, unknown>;
}

export interface ImageResult {
  images: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  cost?: number;
}

export const IMAGE_PROVIDER_CATALOG: Record<string, Omit<ImageProviderConfig, "apiKey">> = {
  openai: { id: "openai", baseUrl: "https://api.openai.com/v1/images/generations", format: "openai", authPrefix: "Bearer " },
  gemini: { id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", format: "gemini" },
  nanobanana: { id: "nanobanana", baseUrl: "https://api.nanobananaapi.ai/v1/images/generations", format: "openai", authPrefix: "Bearer " },
  fal: { id: "fal", baseUrl: "https://api.fal.ai/v1", format: "fal", authHeader: "key" },
  stability: { id: "stability", baseUrl: "https://api.stability.ai/v1/generation", format: "stability", authPrefix: "Bearer " },
  bfl: { id: "bfl", baseUrl: "https://api.bfl.ai/v1", format: "bfl", authHeader: "x-key" },
  recraft: { id: "recraft", baseUrl: "https://external.api.recraft.ai/v1", format: "recraft", authPrefix: "Bearer " },
  runway: { id: "runway", baseUrl: "https://api.dev.runwayml.com/v1", format: "runway", authPrefix: "Bearer " },
  comfyui: { id: "comfyui", baseUrl: "http://localhost:8188", format: "comfyui", noAuth: true },
  sdwebui: { id: "sdwebui", baseUrl: "http://localhost:7860", format: "sdwebui", noAuth: true },
  huggingface: { id: "huggingface", baseUrl: "https://api-inference.huggingface.co/models", format: "huggingface", authPrefix: "Bearer " },
  vertex: { id: "vertex", baseUrl: "https://aiplatform.googleapis.com/v1", format: "vertex" },
};

export class ImageRouter {
  private providers = new Map<string, ImageProviderConfig>();

  registerProvider(config: ImageProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async generate(providerId: string, request: ImageRequest): Promise<ImageResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown image provider: ${providerId}`);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    let url = provider.baseUrl;
    let body: unknown;

    switch (provider.format) {
      case "openai":
        body = { model: request.model, prompt: request.prompt, n: request.n ?? 1, size: request.size ?? "1024x1024", response_format: request.responseFormat ?? "url" };
        break;
      case "gemini":
        // Gemini uses generateContent with responseModalities: ["IMAGE"]
        url = `${provider.baseUrl}/${request.model}:generateContent?key=${provider.apiKey}`;
        body = { contents: [{ parts: [{ text: request.prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } };
        break;
      case "fal":
        // Fal uses queue-based: POST to /{model_id} then poll
        url = `${provider.baseUrl}/${request.model}`;
        body = { prompt: request.prompt, image_size: request.size ?? "landscape_4_3", num_images: request.n ?? 1 };
        break;
      case "stability":
        url = `${provider.baseUrl}/text-to-image/${request.model}`;
        body = { text_prompts: [{ text: request.prompt, weight: 1 }, ...(request.negativePrompt ? [{ text: request.negativePrompt, weight: -1 }] : [])], height: parseInt(request.size?.split("x")[1] ?? "1024"), width: parseInt(request.size?.split("x")[0] ?? "1024"), samples: request.n ?? 1 };
        break;
      case "bfl":
        url = `${provider.baseUrl}/${request.model}`;
        body = { prompt: request.prompt, width: parseInt(request.size?.split("x")[0] ?? "1024"), height: parseInt(request.size?.split("x")[1] ?? "1024") };
        break;
      case "recraft":
        url = `${provider.baseUrl}/images/generations`;
        body = { prompt: request.prompt, model: request.model, size: request.size ?? "1024x1024", n: request.n ?? 1 };
        break;
      case "runway":
        url = `${provider.baseUrl}/text_to_image`;
        body = { model: request.model, promptText: request.prompt, ratio: request.size ?? "1024:1024" };
        break;
      case "comfyui":
        // ComfyUI uses a workflow JSON; simplified here
        body = { prompt: request.prompt };
        break;
      case "sdwebui":
        url = `${provider.baseUrl}/sdapi/v1/txt2img`;
        body = { prompt: request.prompt, negative_prompt: request.negativePrompt, width: parseInt(request.size?.split("x")[0] ?? "512"), height: parseInt(request.size?.split("x")[1] ?? "512") };
        break;
      case "huggingface":
        url = `${provider.baseUrl}/${request.model}`;
        body = { inputs: request.prompt };
        break;
      case "vertex":
        url = `${provider.baseUrl}/publishers/google/models/${request.model}:predict`;
        body = { instances: [{ prompt: request.prompt }], parameters: { sampleCount: request.n ?? 1 } };
        break;
      case "nanobanana":
        // 3rd-party proxy for Nano Banana (uses OpenAI format)
        body = { model: request.model, prompt: request.prompt, n: request.n ?? 1, size: request.size ?? "1024x1024" };
        break;
      default:
        throw new Error(`Unsupported image format: ${provider.format}`);
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Image ${providerId} ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = (await res.json()) as Record<string, unknown>;
    return this.parseResponse(provider.format, data);
  }

  private parseResponse(format: string, data: Record<string, unknown>): ImageResult {
    switch (format) {
      case "openai":
      case "nanobanana":
        return { images: (data.data as Array<{ url?: string; b64_json?: string; revised_prompt?: string }>) ?? [] };
      case "gemini":
        // Gemini returns base64 in inlineData
        return { images: this.parseGeminiResponse(data) };
      case "fal":
      case "bfl":
      case "recraft":
        return { images: (data.images as Array<{ url?: string; b64_json?: string }>) ?? [] };
      case "stability":
        return { images: ((data.artifacts as Array<{ base64: string }>) ?? []).map((a) => ({ b64_json: a.base64 })) };
      case "runway":
        return { images: data.url ? [{ url: data.url as string }] : [] };
      case "comfyui":
      case "sdwebui":
        return { images: ((data.images as Array<{ image: string }>) ?? []).map((i) => ({ b64_json: i.image })) };
      case "huggingface":
        return { images: Array.isArray(data) ? (data as Array<{ image?: string }>).map((d) => ({ b64_json: d.image })) : [] };
      case "vertex":
        return { images: ((data.predictions as Array<{ bytesBase64Encoded: string }>) ?? []).map((p) => ({ b64_json: p.bytesBase64Encoded })) };
      default:
        return { images: [] };
    }
  }

  private parseGeminiResponse(data: Record<string, unknown>): Array<{ url?: string; b64_json?: string }> {
    const candidates = (data.candidates as Array<{ content: { parts: Array<{ inlineData?: { data: string; mimeType: string } }> } }>) ?? [];
    const out: Array<{ b64_json?: string }> = [];
    for (const c of candidates) {
      for (const p of c.content.parts) {
        if (p.inlineData) out.push({ b64_json: p.inlineData.data });
      }
    }
    return out;
  }
}
