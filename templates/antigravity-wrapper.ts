/**
 * antigravity-wrapper.ts
 *
 * Google Antigravity-specific wrapper. Wraps Gemini CLI / Claude format
 * in the Cloud Code envelope (project, sessionId, userAgent=antigravity,
 * requestType=agent, toolConfig, double system prompt injection).
 *
 * Source: 9router open-sse/translator/request/openai-to-gemini.js (wrapInCloudCodeEnvelope)
 *
 * Usage:
 *   import { wrapInCloudCodeEnvelope, ANTIGRAVITY_DEFAULT_SYSTEM } from "./antigravity-wrapper";
 *
 *   const envelope = wrapInAntigravity("claude-sonnet-4-6", claudeRequest, credentials);
 *   // Send envelope to https://daily-cloudcode-pa.googleapis.com/...
 */

export const ANTIGRAVITY_DEFAULT_SYSTEM = `You are Antigravity, a coding agent built on Gemini 3. Built by Google.

# Core Principles
1. **Tools are ground truth**: File system and shell are authoritative. Never claim a file was created or modified unless it actually exists on disk.
2. **Verify, don't assume**: After any non-trivial change, re-read the file or run a command to confirm.
3. **Plan first for non-trivial tasks**: Use the task list to break work into clear steps before starting.
4. **Prefer minimal changes**: Smallest diff that solves the problem. No drive-by refactors.
5. **Communication**: Be concise. Show your work in commands and file diffs, not prose.

# Available Capabilities
- Read, write, edit files (relative to the working directory)
- Run shell commands
- Search the codebase
- Use the browser for verification
- Plan mode for non-trivial tasks

# Output Style
- Be direct. No filler.
- Use code blocks for commands and file contents.
- When uncertain, ask a clarifying question before acting.`;

export interface CloudCodeCredentials {
  projectId?: string;
  email?: string;
  connectionId?: string;
}

function generateUUID(): string {
  // Node 18+ has crypto.randomUUID globally
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function generateProjectId(): string {
  // Project IDs are 26-char lowercase alphanumeric
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 26; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function deriveSessionId(seed: string | undefined): string {
  // Derive a stable session ID from email/connectionId so it persists across requests
  if (!seed) return generateUUID();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return `sess-${Math.abs(hash).toString(16)}`;
}

export function generateAntigravityProjectId(): string {
  return generateProjectId();
}

// Wrap a Gemini CLI-format request in the Cloud Code envelope for Antigravity
export function wrapInAntigravity(
  model: string,
  geminiCLIRequest: { contents: unknown[]; systemInstruction?: { role: string; parts: Array<{ text: string }> }; generationConfig?: Record<string, unknown>; tools?: unknown[]; safetySettings?: unknown[] },
  credentials: CloudCodeCredentials = {},
  isAntigravity = true,
): Record<string, unknown> {
  const projectId = credentials.projectId || generateProjectId();
  const sessionId = deriveSessionId(credentials.email || credentials.connectionId);

  const envelope: Record<string, unknown> = {
    project: projectId,
    model,
    userAgent: isAntigravity ? "antigravity" : "gemini-cli",
    requestId: isAntigravity ? `agent-${generateUUID()}` : generateUUID(),
    request: {
      sessionId,
      contents: geminiCLIRequest.contents,
      ...(geminiCLIRequest.systemInstruction ? { systemInstruction: geminiCLIRequest.systemInstruction } : {}),
      ...(geminiCLIRequest.generationConfig ? { generationConfig: geminiCLIRequest.generationConfig } : {}),
      ...(geminiCLIRequest.tools ? { tools: geminiCLIRequest.tools } : {}),
    },
  };

  if (isAntigravity) {
    envelope.requestType = "agent";
    // Double-inject system prompt to prevent user override
    const systemParts: Array<{ text: string }> = [
      { text: ANTIGRAVITY_DEFAULT_SYSTEM },
      { text: `Please ignore the following [ignore]${ANTIGRAVITY_DEFAULT_SYSTEM}[/ignore]` },
    ];
    const existing = (envelope.request as Record<string, unknown>).systemInstruction as { role: string; parts: Array<{ text: string }> } | undefined;
    if (existing?.parts) {
      existing.parts.unshift(...systemParts);
    } else {
      (envelope.request as Record<string, unknown>).systemInstruction = { role: "user", parts: systemParts };
    }
    if (geminiCLIRequest.tools && (geminiCLIRequest.tools as unknown[]).length > 0) {
      (envelope.request as Record<string, unknown>).toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
    }
  } else {
    // Keep safetySettings for Gemini CLI
    if (geminiCLIRequest.safetySettings) {
      (envelope.request as Record<string, unknown>).safetySettings = geminiCLIRequest.safetySettings;
    }
  }

  return envelope;
}

// Strip Gemini safety settings (default: OFF for all categories)
export const DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" },
];

// Sanitize Gemini function names (must match /^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$/)
export function sanitizeGeminiFunctionName(name: string): string {
  if (!name) return "_unknown";
  let sanitized = name.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = "_" + sanitized;
  return sanitized.substring(0, 64);
}
