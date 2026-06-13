/**
 * tts-provider.ts
 *
 * Text-to-Speech provider abstraction. Supports 10+ TTS providers with voice catalog
 * and config-driven format dispatch.
 *
 * Source: open-sse/handlers/ttsCore.js, ttsProviders/* (openai, elevenlabs, cartesia, etc.)
 *
 * Usage:
 *   import { TTSRouter, TTS_PROVIDER_CATALOG } from "./tts-provider";
 *
 *   const tts = new TTSRouter();
 *   tts.registerProvider({ id: "openai", apiKey: "sk-..." });
 *   const audio = await tts.synthesize("openai", "tts-1", "alloy", "Hello world");
 */

// === Provider config (subset of 9router ttsProviders/*) ===
export interface TTSProviderConfig {
  id: string;                      // "openai", "elevenlabs", "edge-tts", dll
  baseUrl: string;                 // POST /v1/audio/speech
  apiKey: string;
  format: "openai" | "elevenlabs" | "cartesia" | "playht" | "inworld" | "deepgram" | "google-tts" | "edge-tts" | "minimax" | "coqui" | "local-device" | "huggingface" | "hyperbolic" | "nvidia";
  defaultModel: string;
  defaultVoice?: string;
  headers?: Record<string, string>;
  authHeader?: string;             // "xi-api-key" for ElevenLabs, "token" for Deepgram
  authPrefix?: string;             // "Bearer " (default), "Key ", "Token ", "Basic "
  noAuth?: boolean;                // edge-tts, local-device, google-tts
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface Voice {
  id: string;
  name: string;
  gender?: "male" | "female" | "neutral";
  language?: string;               // BCP-47: "en-US", "id-ID"
  description?: string;
  previewUrl?: string;
}

export interface TTSRequest {
  model: string;
  input: string;
  voice: string;
  responseFormat?: "mp3" | "wav" | "opus" | "flac" | "pcm";
  speed?: number;                  // 0.25 - 4.0
  // ElevenLabs-specific
  stability?: number;              // 0-1
  similarityBoost?: number;         // 0-1
  style?: number;                   // 0-1
  // Cartesia-specific
  language?: string;
  // Provider-specific data (e.g. region, voice settings)
  providerSpecificData?: Record<string, unknown>;
}

export interface TTSResult {
  audio: ArrayBuffer | Buffer;
  contentType: string;             // "audio/mpeg", "audio/wav", dll
  durationMs?: number;
  cost?: number;
}

// === Built-in voice catalogs (subset) ===
export const VOICE_CATALOG: Record<string, Voice[]> = {
  openai: [
    { id: "alloy", name: "Alloy", gender: "neutral" },
    { id: "echo", name: "Echo", gender: "male" },
    { id: "fable", name: "Fable", gender: "neutral" },
    { id: "onyx", name: "Onyx", gender: "male" },
    { id: "nova", name: "Nova", gender: "female" },
    { id: "shimmer", name: "Shimmer", gender: "female" },
  ],
  elevenlabs: [
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", language: "en-US" },
    { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", language: "en-US" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female", language: "en-US" },
    { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", language: "en-US" },
    { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", language: "en-US" },
    { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", language: "en-US" },
    { id: "VR6AewLT3WGmG4fM5lru", name: "Arnold", gender: "male", language: "en-US" },
    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", language: "en-US" },
    { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male", language: "en-US" },
  ],
  cartesia: [
    { id: "sonic-2", name: "Sonic 2", gender: "neutral" },
    { id: "sonic-3", name: "Sonic 3", gender: "neutral" },
  ],
  edge: [
    { id: "en-US-AriaNeural", name: "Aria (en-US)", gender: "female", language: "en-US" },
    { id: "en-US-JennyNeural", name: "Jenny (en-US)", gender: "female", language: "en-US" },
    { id: "en-US-GuyNeural", name: "Guy (en-US)", gender: "male", language: "en-US" },
    { id: "id-ID-ArdiNeural", name: "Ardi (id-ID)", gender: "male", language: "id-ID" },
    { id: "id-ID-GadisNeural", name: "Gadis (id-ID)", gender: "female", language: "id-ID" },
  ],
};

// === Pre-configured provider catalog (subset of 9router) ===
export const TTS_PROVIDER_CATALOG: Record<string, Omit<TTSProviderConfig, "apiKey">> = {
  openai: {
    id: "openai",
    baseUrl: "https://api.openai.com/v1/audio/speech",
    format: "openai",
    defaultModel: "tts-1",
    defaultVoice: "alloy",
    authPrefix: "Bearer ",
  },
  elevenlabs: {
    id: "elevenlabs",
    baseUrl: "https://api.elevenlabs.io/v1/text-to-speech",
    format: "elevenlabs",
    defaultModel: "eleven_multilingual_v2",
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    authHeader: "xi-api-key",
  },
  cartesia: {
    id: "cartesia",
    baseUrl: "https://api.cartesia.ai/tts/bytes",
    format: "cartesia",
    defaultModel: "sonic-3",
    authHeader: "x-api-key",
  },
  playht: {
    id: "playht",
    baseUrl: "https://api.play.ht/api/v2/tts/stream",
    format: "playht",
    defaultModel: "Play3.0-mini",
    authHeader: "playht",
  },
  inworld: {
    id: "inworld",
    baseUrl: "https://api.inworld.ai/tts/v1/voice",
    format: "inworld",
    defaultModel: "inworld-tts-1.5-max",
    authPrefix: "Basic ",
  },
  deepgram: {
    id: "deepgram",
    baseUrl: "https://api.deepgram.com/v1/speak",
    format: "deepgram",
    defaultModel: "aura-2",
    authHeader: "token",
  },
  google: {
    id: "google",
    baseUrl: "https://texttospeech.googleapis.com/v1/text:synthesize",
    format: "google-tts",
    defaultModel: "en-US-Neural2-A",
    noAuth: true,
  },
  "edge-tts": {
    id: "edge-tts",
    baseUrl: "https://api.edge-tts.microsoft.com/v1/synthesize",
    format: "edge-tts",
    defaultModel: "en-US-AriaNeural",
    noAuth: true,
  },
  minimax: {
    id: "minimax",
    baseUrl: "https://api.minimax.io/v1/t2a_v2",
    format: "minimax",
    defaultModel: "speech-2.6-hd",
    authPrefix: "Bearer ",
  },
};

// === Format-specific request body builders ===
function buildOpenAITTSBody(req: TTSRequest): unknown {
  return {
    model: req.model,
    input: req.input,
    voice: req.voice,
    ...(req.responseFormat ? { response_format: req.responseFormat } : {}),
    ...(req.speed ? { speed: req.speed } : {}),
  };
}

function buildElevenLabsTTSBody(req: TTSRequest, model: string): unknown {
  return {
    text: req.input,
    model_id: model,
    voice_settings: {
      stability: req.stability ?? 0.5,
      similarity_boost: req.similarityBoost ?? 0.75,
      ...(req.style ? { style: req.style } : {}),
    },
  };
}

function buildCartesiaTTSBody(req: TTSRequest): unknown {
  return {
    model_id: req.model,
    transcript: req.input,
    voice: { mode: "id", id: req.voice },
    output_format: { container: "mp3", bit_rate: 128000 },
    language: req.language ?? "en",
  };
}

function buildDeepgramTTSBody(req: TTSRequest): unknown {
  return { text: req.input };
}

function buildInworldTTSBody(req: TTSRequest): unknown {
  return {
    text: req.input,
    voiceId: req.voice,
    modelId: req.model,
  };
}

function buildPlayHTTTSBody(req: TTSRequest): unknown {
  return {
    text: req.input,
    voice: req.voice,
    output_format: req.responseFormat?.toUpperCase() ?? "MP3",
  };
}

function buildMinimaxTTSBody(req: TTSRequest): unknown {
  return {
    model: req.model,
    text: req.input,
    voice_setting: { voice: req.voice, speed: req.speed ?? 1.0 },
    audio_setting: { format: req.responseFormat ?? "mp3" },
  };
}

// === Main router ===
export class TTSRouter {
  private providers = new Map<string, TTSProviderConfig>();

  registerProvider(config: TTSProviderConfig): void {
    this.providers.set(config.id, config);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getVoices(providerId: string): Voice[] {
    return VOICE_CATALOG[providerId] ?? [];
  }

  async synthesize(providerId: string, request: TTSRequest): Promise<TTSResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown TTS provider: ${providerId}`);

    // Build request based on format
    let url = provider.baseUrl;
    let body: unknown;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(provider.headers ?? {}),
      ...(provider.extraHeaders ?? {}),
    };

    if (!provider.noAuth) {
      const authValue = provider.authHeader ? provider.apiKey : (provider.authPrefix ?? "Bearer ") + provider.apiKey;
      headers[provider.authHeader ?? "Authorization"] = authValue;
    }

    switch (provider.format) {
      case "openai":
        body = buildOpenAITTSBody(request);
        break;
      case "elevenlabs":
        url = `${url}/${request.voice}`;  // ElevenLabs: /v1/text-to-speech/{voice_id}
        body = buildElevenLabsTTSBody(request, request.model);
        break;
      case "cartesia":
        body = buildCartesiaTTSBody(request);
        break;
      case "deepgram":
        url = `${url}?model=${request.model}`;
        body = buildDeepgramTTSBody(request);
        break;
      case "inworld":
        body = buildInworldTTSBody(request);
        break;
      case "playht":
        body = buildPlayHTTTSBody(request);
        break;
      case "minimax":
        body = buildMinimaxTTSBody(request);
        break;
      case "google-tts":
      case "edge-tts":
      case "coqui":
      case "local-device":
      case "huggingface":
      case "hyperbolic":
      case "nvidia":
        // These are typically handled by specialized executors; fall through to default
        body = { model: request.model, input: request.input, voice: request.voice };
        break;
      default:
        body = { model: request.model, input: request.input, voice: request.voice };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(provider.timeoutMs ?? 30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TTS ${providerId} returned ${res.status}: ${text.slice(0, 200)}`);
    }

    const contentType = res.headers.get("content-type") ?? "audio/mpeg";
    const audio = await res.arrayBuffer();
    return { audio, contentType };
  }
}
