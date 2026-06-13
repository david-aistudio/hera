/**
 * spoof-headers.ts
 *
 * Client identity spoofing for providers that gate on client fingerprint.
 * Extracted from 9router open-sse/config/providers.js (CLAUDE_CLI_SPOOF_HEADERS, etc.)
 *
 * Some providers (e.g. agentrouter, Kiro) check for specific client identity
 * headers. To bypass, we send the official CLI's fingerprint.
 *
 * Usage:
 *   import { getSpoofHeaders, SPOOF_PROFILES } from "./spoof-headers";
 *
 *   const headers = getSpoofHeaders("claude-cli", platform(), arch());
 *   // → { "Anthropic-Version": "2023-06-01", "User-Agent": "claude-cli/2.1.92 ...", ... }
 */

import { platform, arch } from "os";

export type SpoofProfile =
  | "claude-cli"
  | "claude-api"
  | "codex-cli"
  | "antigravity"
  | "gemini-cli"
  | "kiro"
  | "cursor";

function mapStainlessOs(): string {
  switch (platform()) {
    case "darwin": return "MacOS";
    case "win32": return "Windows";
    case "linux": return "Linux";
    case "freebsd": return "FreeBSD";
    default: return `Other::${platform()}`;
  }
}

function mapStainlessArch(): string {
  switch (arch()) {
    case "x64": return "x64";
    case "arm64": return "arm64";
    case "ia32": return "x86";
    default: return `other::${arch()}`;
  }
}

// Shared Claude-format headers
const CLAUDE_API_HEADERS = {
  "Anthropic-Version": "2023-06-01",
  "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
};

// Full Claude CLI fingerprint (gating bypass for agentrouter, Kiro OAuth Claude, etc.)
const CLAUDE_CLI_SPOOF = {
  "Anthropic-Version": "2023-06-01",
  "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24,structured-outputs-2025-12-15,fast-mode-2026-02-01,redact-thinking-2026-02-12,token-efficient-tools-2026-03-28",
  "Anthropic-Dangerous-Direct-Browser-Access": "true",
  "User-Agent": "claude-cli/2.1.92 (external, sdk-cli)",
  "X-App": "cli",
  "X-Stainless-Helper-Method": "stream",
  "X-Stainless-Retry-Count": "0",
  "X-Stainless-Runtime-Version": "v24.14.0",
  "X-Stainless-Package-Version": "0.80.0",
  "X-Stainless-Runtime": "node",
  "X-Stainless-Lang": "js",
  "X-Stainless-Arch": mapStainlessArch(),
  "X-Stainless-Os": mapStainlessOs(),
  "X-Stainless-Timeout": "600",
};

const CODEX_CLI_SPOOF = {
  originator: "codex_cli_rs",
  "User-Agent": "codex_cli_rs/0.136.0",
};

const ANTIGRAVITY_SPOOF = {
  "User-Agent": `antigravity/1.107.0 ${platform()}/${arch()}`,
};

const GEMINI_CLI_SPOOF = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
};

const KIRO_SPOOF = {
  "Content-Type": "application/json",
  Accept: "application/vnd.amazon.eventstream",
  "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
  "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
  "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
};

const CURSOR_SPOOF = {
  "connect-accept-encoding": "gzip",
  "connect-protocol-version": "1",
  "Content-Type": "application/connect+proto",
  "User-Agent": "connect-es/1.6.1",
};

export const SPOOF_PROFILES: Record<SpoofProfile, Record<string, string>> = {
  "claude-cli": CLAUDE_CLI_SPOOF,
  "claude-api": CLAUDE_API_HEADERS,
  "codex-cli": CODEX_CLI_SPOOF,
  antigravity: ANTIGRAVITY_SPOOF,
  "gemini-cli": GEMINI_CLI_SPOOF,
  kiro: KIRO_SPOOF,
  cursor: CURSOR_SPOOF,
};

export function getSpoofHeaders(profile: SpoofProfile, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return { ...SPOOF_PROFILES[profile], ...extraHeaders };
}

// Refresh on each call (in case platform/arch changes in long-running processes)
export function getDynamicSpoofHeaders(profile: SpoofProfile, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const base = { ...SPOOF_PROFILES[profile] };

  // Update dynamic fields (X-Stainless-Arch, X-Stainless-Os, User-Agent)
  if (profile === "claude-cli") {
    base["X-Stainless-Arch"] = mapStainlessArch();
    base["X-Stainless-Os"] = mapStainlessOs();
  } else if (profile === "antigravity") {
    base["User-Agent"] = `antigravity/1.107.0 ${platform()}/${arch()}`;
  }

  return { ...base, ...extraHeaders };
}
