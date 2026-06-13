/**
 * stt-provider.ts
 *
 * Speech-to-Text provider abstraction. Supports 8+ STT providers.
 *
 * Source: open-sse/handlers/sttCore.js
 *
 * Usage:
 *   const stt = new STTRouter();
 *   stt.registerProvider({ id: "openai", apiKey: "sk-..." });
 *   const result = await stt.transcribe("openai", "whisper-1", audioBuffer, { language: "en" });
 */

export interface STTProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  format: "openai" | "deepgram" | "assemblyai" | "nvidia" | "gemini" | "huggingface" | "groq";
  headers?: Record<string, string>;
  authHeader?: string;
  authPrefix?: string;
  noAuth?: boolean;
  // AssemblyAI is async: returns transcript ID, need to poll
  async?: boolean;
}

export interface STTRequest {
  model: string;
  audio: Buffer | ArrayBuffer | Blob;
  filename?: string;
  contentType?: string;             // "audio/wav", "audio/mp3", "audio/webm", "audio/ogg"
  language?: string;                // BCP-47: "en", "id", "auto"
  prompt?: string;                  // Context/bias
  responseFormat?: "json" | "text" | "srt" | "vtt" | "verbose_json";
  temperature?: number;
  // Deepgram-specific
  smartFormat?: boolean;
  diarize?: boolean;
  // AssemblyAI-specific
  webhookUrl?: string;
}

export interface STTResult {
  text: string;
  language?: string;
  duration?: number;
  words?: Array<{ word: string; start: number; end: number; confidence: number }>;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
  cost?: number;
}

// === Provider catalog (subset of 9router) ===
export const STT_PROVIDER_CATALOG: Record<string, Omit<STTProviderConfig, "apiKey">> = {
  openai: {
    id: "openai",
    baseUrl: "https://api.openai.com/v1/audio/transcriptions",
    format: "openai",
    authPrefix: "Bearer ",
  },
  groq: {
    id: "groq",
    baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
    format: "groq",
    authPrefix: "Bearer ",
  },
  deepgram: {
    id: "deepgram",
    baseUrl: "https://api.deepgram.com/v1/listen",
    format: "deepgram",
    authHeader: "token",
  },
  assemblyai: {
    id: "assemblyai",
    baseUrl: "https://api.assemblyai.com/v2/transcript",
    format: "assemblyai",
    authPrefix: "Bearer ",
    async: true,
  },
  nvidia: {
    id: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1/audio/transcriptions",
    format: "nvidia",
    authPrefix: "Bearer ",
  },
  gemini: {
    id: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: "gemini",
  },
  huggingface: {
    id: "huggingface",
    baseUrl: "https://api-inference.huggingface.co/models",
    format: "huggingface",
    authPrefix: "Bearer ",
  },
};

export class STTRouter {
  private providers = new Map<string, STTProviderConfig>();

  registerProvider(config: STTProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async transcribe(providerId: string, request: STTRequest): Promise<STTResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown STT provider: ${providerId}`);

    switch (provider.format) {
      case "openai":
      case "groq":
      case "nvidia":
        return this.transcribeOpenAIFormat(provider, request);
      case "deepgram":
        return this.transcribeDeepgram(provider, request);
      case "assemblyai":
        return this.transcribeAssemblyAI(provider, request);
      case "gemini":
        return this.transcribeGemini(provider, request);
      case "huggingface":
        return this.transcribeHuggingFace(provider, request);
      default:
        throw new Error(`Unsupported STT format: ${provider.format}`);
    }
  }

  private async transcribeOpenAIFormat(provider: STTProviderConfig, req: STTRequest): Promise<STTResult> {
    const form = new FormData();
    form.append("model", req.model);
    if (req.audio instanceof Blob) {
      form.append("file", req.audio, req.filename ?? "audio.wav");
    } else {
      const buf = req.audio instanceof ArrayBuffer ? Buffer.from(req.audio) : req.audio;
      // Copy to a fresh ArrayBuffer to avoid SharedArrayBuffer/BlobPart mismatch
      const u8 = new Uint8Array(buf.byteLength);
      u8.set(buf);
      const blob = new Blob([u8], { type: req.contentType ?? "audio/wav" });
      form.append("file", blob, req.filename ?? "audio.wav");
    }
    if (req.language) form.append("language", req.language);
    if (req.prompt) form.append("prompt", req.prompt);
    if (req.responseFormat) form.append("response_format", req.responseFormat);
    if (req.temperature !== undefined) form.append("temperature", String(req.temperature));

    const headers: Record<string, string> = { ...(provider.headers ?? {}) };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    const res = await fetch(provider.baseUrl, { method: "POST", headers, body: form });
    if (!res.ok) throw new Error(`STT ${provider.id} ${res.status}: ${await res.text()}`);

    if (req.responseFormat === "text") {
      return { text: await res.text() };
    }
    const data = (await res.json()) as { text: string; language?: string; duration?: number };
    return { text: data.text, language: data.language, duration: data.duration };
  }

  private async transcribeDeepgram(provider: STTProviderConfig, req: STTRequest): Promise<STTResult> {
    const params = new URLSearchParams({ model: req.model });
    if (req.language) params.set("language", req.language);
    if (req.smartFormat) params.set("smart_format", "true");
    if (req.diarize) params.set("diarize", "true");

    const buf = req.audio instanceof ArrayBuffer ? Buffer.from(req.audio) : req.audio instanceof Blob ? Buffer.from(await req.audio.arrayBuffer()) : req.audio;
    const headers: Record<string, string> = {
      "Content-Type": req.contentType ?? "audio/wav",
      ...(provider.headers ?? {}),
    };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Token ") + provider.apiKey;
    }

    // Copy to fresh ArrayBuffer to satisfy BodyInit (avoid SharedArrayBuffer)
    const u8 = new Uint8Array(buf.byteLength);
    u8.set(buf);
    const res = await fetch(`${provider.baseUrl}?${params}`, { method: "POST", headers, body: u8 });
    if (!res.ok) throw new Error(`STT ${provider.id} ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      results: {
        channels: Array<{
          alternatives: Array<{ transcript: string; words?: Array<{ word: string; start: number; end: number; confidence: number }> }>;
        }>;
      };
    };
    const alt = data.results.channels[0].alternatives[0];
    return { text: alt.transcript, words: alt.words };
  }

  private async transcribeAssemblyAI(provider: STTProviderConfig, req: STTRequest): Promise<STTResult> {
    // Async flow: upload → submit → poll
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(provider.headers ?? {}),
    };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }

    // Step 1: submit
    const submit = await fetch(provider.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio_url: req.webhookUrl,  // Or upload first
        language_code: req.language ?? "en_us",
      }),
    });
    if (!submit.ok) throw new Error(`AssemblyAI submit ${submit.status}: ${await submit.text()}`);
    const { id } = (await submit.json()) as { id: string };

    // Step 2: poll
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`${provider.baseUrl}/${id}`, { headers });
      const data = (await poll.json()) as { status: string; text?: string; error?: string };
      if (data.status === "completed") return { text: data.text ?? "" };
      if (data.status === "error") throw new Error(`AssemblyAI error: ${data.error}`);
    }
    throw new Error("AssemblyAI transcription timeout");
  }

  private async transcribeGemini(provider: STTProviderConfig, req: STTRequest): Promise<STTResult> {
    // Gemini uses generateContent with inline audio data
    const buf = req.audio instanceof ArrayBuffer ? Buffer.from(req.audio) : req.audio instanceof Blob ? Buffer.from(await req.audio.arrayBuffer()) : req.audio;
    const base64 = Buffer.isBuffer(buf) ? buf.toString("base64") : "";
    const url = `${provider.baseUrl}/${req.model}:generateContent?key=${provider.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: req.contentType ?? "audio/wav", data: base64 } },
            { text: "Transcribe this audio. Output plain text only." },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Gemini STT ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return { text: data.candidates[0].content.parts[0].text };
  }

  private async transcribeHuggingFace(provider: STTProviderConfig, req: STTRequest): Promise<STTResult> {
    const buf = req.audio instanceof ArrayBuffer ? Buffer.from(req.audio) : req.audio instanceof Blob ? Buffer.from(await req.audio.arrayBuffer()) : req.audio;
    const url = `${provider.baseUrl}/${req.model}`;
    const headers: Record<string, string> = {
      "Content-Type": req.contentType ?? "audio/wav",
      ...(provider.headers ?? {}),
    };
    if (!provider.noAuth) {
      headers[provider.authHeader ?? "Authorization"] = (provider.authPrefix ?? "Bearer ") + provider.apiKey;
    }
    const res = await fetch(url, { method: "POST", headers, body: new Uint8Array(buf) });
    if (!res.ok) throw new Error(`HF STT ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text: string };
    return { text: data.text };
  }
}
