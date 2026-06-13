/**
 * multimodal-input.ts
 *
 * Multi-modal content handling — text, image (URL/data/base64), audio (input/file),
 * video, PDF. Translates between OpenAI content parts and other provider formats.
 *
 * Source pattern: open-sse/translator/helpers/geminiHelper.js (convertOpenAIContentToParts)
 *
 * Usage:
 *   import { normalizeContent, toClaudeContent, toGeminiParts } from "./multimodal-input";
 *
 *   const parts = toOpenAIParts([{type:"image_url",image_url:{url:"data:image/png;base64,..."}}]);
 *   const claudeBlocks = toClaudeContent(parts);
 *   const geminiParts = toGeminiParts(parts);
 */

// === Content part types (OpenAI shape) ===
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } }
  | { type: "audio_url"; audio_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data?: string; file_id?: string } }
  | { type: "video_url"; video_url: { url: string } };

export type Content = string | ContentPart[];

// === MIME type inference ===
const MIME_BY_FORMAT: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function inferMimeType(urlOrData: string, fallback = "application/octet-stream"): string {
  if (urlOrData.startsWith("data:")) {
    const match = urlOrData.match(/^data:([^;,]+)/);
    return match?.[1] ?? fallback;
  }
  const ext = urlOrData.split(".").pop()?.toLowerCase().split("?")[0];
  return (ext && MIME_BY_FORMAT[ext]) || fallback;
}

export function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

export function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  if (!isDataUrl(url)) return null;
  const match = url.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// === Normalize content to OpenAI parts ===
export function normalizeContent(content: Content): ContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

// === Extract just the text (for system messages, summarization, etc.) ===
export function extractText(content: Content): string {
  const parts = normalizeContent(content);
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

// === Strip content by type (for models that don't support image/audio) ===
export function stripContent(content: Content, stripTypes: ("image" | "audio")[]): Content {
  const parts = normalizeContent(content);
  const isImage = (p: ContentPart) => p.type === "image_url";
  const isAudio = (p: ContentPart) => p.type === "input_audio" || p.type === "audio_url";
  const filtered = parts.filter((p) => {
    if (stripTypes.includes("image") && isImage(p)) return false;
    if (stripTypes.includes("audio") && isAudio(p)) return false;
    return true;
  });
  // If everything got stripped, return empty string so message isn't broken
  return filtered.length > 0 ? filtered : "";
}

// === Convert to OpenAI format (identity, but validates shape) ===
export function toOpenAIParts(content: Content): ContentPart[] {
  return normalizeContent(content);
}

// === Convert to Claude content blocks ===
export interface ClaudeBlock {
  type: "text" | "image" | "audio" | "document";
  text?: string;
  source?: { type: "base64" | "url"; media_type: string; data: string | { url: string } };
}

export function toClaudeContent(content: Content): ClaudeBlock[] {
  const parts = normalizeContent(content);
  const blocks: ClaudeBlock[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const url = part.image_url.url;
      const data = parseDataUrl(url);
      if (data) {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: data.mimeType, data: data.data },
        });
      } else if (isHttpUrl(url)) {
        blocks.push({
          type: "image",
          source: { type: "url", media_type: inferMimeType(url, "image/*"), data: { url } },
        });
      }
    } else if (part.type === "input_audio" || part.type === "audio_url") {
      const url = part.type === "input_audio" ? `data:audio/${part.input_audio.format};base64,${part.input_audio.data}` : part.audio_url.url;
      const data = parseDataUrl(url);
      if (data) {
        blocks.push({
          type: "audio",
          source: { type: "base64", media_type: data.mimeType, data: data.data },
        });
      } else if (isHttpUrl(url)) {
        blocks.push({
          type: "audio",
          source: { type: "url", media_type: inferMimeType(url, "audio/*"), data: { url } },
        });
      }
    } else if (part.type === "file") {
      if (part.file.file_data) {
        const data = parseDataUrl(`data:application/pdf;base64,${part.file.file_data}`);
        if (data) {
          blocks.push({
            type: "document",
            source: { type: "base64", media_type: data.mimeType, data: data.data },
          });
        }
      } else if (part.file.file_id) {
        blocks.push({
          type: "document",
          source: { type: "url", media_type: "application/pdf", data: { url: part.file.file_id } },
        });
      }
    }
  }

  return blocks;
}

// === Convert to Gemini parts (inlineData + fileData) ===
export interface GeminiPart {
  text?: string;
  inlineData?: { mime_type: string; data: string };
  fileData?: { fileUri: string; mimeType: string };
}

export function toGeminiParts(content: Content): GeminiPart[] {
  const parts = normalizeContent(content);
  const out: GeminiPart[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      out.push({ text: part.text });
    } else if (part.type === "image_url") {
      const url = part.image_url.url;
      const data = parseDataUrl(url);
      if (data) {
        out.push({ inlineData: { mime_type: data.mimeType, data: data.data } });
      } else if (isHttpUrl(url)) {
        out.push({ fileData: { fileUri: url, mimeType: inferMimeType(url, "image/*") } });
      }
    } else if (part.type === "input_audio" || part.type === "audio_url") {
      const url = part.type === "input_audio"
        ? `data:audio/${part.input_audio.format};base64,${part.input_audio.data}`
        : part.audio_url.url;
      const data = parseDataUrl(url);
      if (data) {
        out.push({ inlineData: { mime_type: data.mimeType, data: data.data } });
      } else if (isHttpUrl(url)) {
        out.push({ fileData: { fileUri: url, mimeType: inferMimeType(url, "audio/*") } });
      }
    } else if (part.type === "video_url") {
      out.push({ fileData: { fileUri: part.video_url.url, mimeType: "video/*" } });
    } else if (part.type === "file" && part.file.file_data) {
      out.push({ inlineData: { mime_type: "application/pdf", data: part.file.file_data } });
    }
  }

  return out;
}

// === Convert to Responses API (OpenAI) — input_text/input_image/input_audio ===
export interface ResponsesContentPart {
  type: "input_text" | "input_image" | "input_audio" | "input_file";
  text?: string;
  image_url?: string;
  input_audio?: { data: string; format: string };
  file_data?: string;
  filename?: string;
  file_id?: string;
}

export function toResponsesParts(content: Content): ResponsesContentPart[] {
  const parts = normalizeContent(content);
  const out: ResponsesContentPart[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      out.push({ type: "input_text", text: part.text });
    } else if (part.type === "image_url") {
      out.push({ type: "input_image", image_url: part.image_url.url });
    } else if (part.type === "input_audio") {
      out.push({ type: "input_audio", input_audio: part.input_audio });
    } else if (part.type === "file") {
      if (part.file.file_data) {
        out.push({ type: "input_file", file_data: part.file.file_data, filename: part.file.filename });
      } else if (part.file.file_id) {
        out.push({ type: "input_file", file_id: part.file.file_id, filename: part.file.filename });
      }
    }
  }

  return out;
}

// === Helper: convert file path → base64 data URL ===
export async function fileToDataUrl(path: string, mimeType?: string): Promise<string> {
  // Node.js only
  const fs = await import("fs/promises");
  const buf = await fs.readFile(path);
  const detected = mimeType ?? inferMimeType(path, "application/octet-stream");
  return `data:${detected};base64,${buf.toString("base64")}`;
}

// === Helper: detect content kinds present ===
export function detectContentKinds(content: Content): { hasText: boolean; hasImage: boolean; hasAudio: boolean; hasVideo: boolean; hasFile: boolean } {
  const parts = normalizeContent(content);
  return {
    hasText: parts.some((p) => p.type === "text"),
    hasImage: parts.some((p) => p.type === "image_url"),
    hasAudio: parts.some((p) => p.type === "input_audio" || p.type === "audio_url"),
    hasVideo: parts.some((p) => p.type === "video_url"),
    hasFile: parts.some((p) => p.type === "file"),
  };
}
