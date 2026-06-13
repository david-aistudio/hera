#!/usr/bin/env node
/**
 * Hera CLI — Provider Commands
 *
 * Manage AI providers in a project: add, list, remove, test, fetch models.
 *
 * Usage:
 *   hera provider add <id>       Add a custom provider to current project
 *   hera provider list           List configured providers
 *   hera provider remove <id>    Remove a provider
 *   hera provider test <id>      Test provider API key
 *   hera provider models <id>    Fetch live model list from provider
 *   hera provider --help         Show help
 *
 * Stores config in .hera/providers.json in the current directory.
 */

import * as fs from "fs";
import * as path from "path";

const CONFIG_DIR = ".hera";
const CONFIG_FILE = "providers.json";
const SUPPORTED_FORMATS = ["openai", "claude", "gemini", "openai-responses", "antigravity", "kiro", "cursor", "ollama"];

interface ProviderEntry {
  id: string;
  baseUrl: string;
  format: string;
  apiKey: string;
  authHeader?: string;
  noAuth?: boolean;
  addedAt: string;
}

const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function ensureConfigDir(): string {
  const dir = path.join(process.cwd(), CONFIG_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadConfig(): Record<string, ProviderEntry> {
  const file = path.join(process.cwd(), CONFIG_DIR, CONFIG_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: Record<string, ProviderEntry>): void {
  ensureConfigDir();
  fs.writeFileSync(path.join(process.cwd(), CONFIG_DIR, CONFIG_FILE), JSON.stringify(config, null, 2));
}

function showHelp(): void {
  console.log(`
${c("bold", "hera provider")} — Manage AI providers in your project

${c("bold", "Usage:")}
  hera provider <command> [options]

${c("bold", "Commands:")}
  add <id>          Add a custom provider (interactive: baseUrl, format, apiKey)
  list              List all configured providers
  remove <id>       Remove a provider by id
  test <id>         Test provider API key (probes /v1/models or equivalent)
  models <id>       Fetch live model list from provider's /v1/models
  show <id>         Show provider config (without revealing full apiKey)
  formats           List supported provider formats

${c("bold", "Options:")}
  --help, -h        Show this help
  --url <url>       Base URL (skip interactive prompt)
  --format <fmt>    Provider format (skip interactive prompt)
  --key <key>       API key (skip interactive prompt; use 'none' for no-auth)

${c("bold", "Examples:")}
  ${c("dim", "# Add a custom OpenAI-compatible provider")}
  hera provider add local-llm --url http://localhost:8080/v1/chat/completions --format openai --key none

  ${c("dim", "# List providers")}
  hera provider list

  ${c("dim", "# Test if an API key works")}
  hera provider test openai --key sk-...

  ${c("dim", "# Fetch live model list")}
  hera provider models openai
`);
}

function cmdAdd(id: string, args: string[]): void {
  const config = loadConfig();
  if (config[id]) {
    console.error(c("red", `✗ Provider "${id}" already exists. Use "hera provider remove" first.`));
    process.exit(1);
  }

  // Parse flags
  let baseUrl = "";
  let format = "";
  let apiKey = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") baseUrl = args[++i];
    else if (args[i] === "--format") format = args[++i];
    else if (args[i] === "--key") apiKey = args[++i];
  }

  // Interactive prompts if not provided
  if (!baseUrl) {
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Base URL (e.g. https://api.openai.com/v1/chat/completions): `, (a: string) => {
      baseUrl = a.trim();
      if (!format) rl.question(`Format [${SUPPORTED_FORMATS.join("|")}]: `, (b: string) => {
        format = b.trim();
        if (!apiKey) rl.question(`API key (or "none" for no-auth): `, (c: string) => {
          apiKey = c.trim();
          rl.close();
          finishAdd(id, config, baseUrl, format, apiKey);
        });
        else { rl.close(); finishAdd(id, config, baseUrl, format, apiKey); }
      });
      else if (!apiKey) { rl.question(`API key (or "none" for no-auth): `, (c: string) => { apiKey = c.trim(); rl.close(); finishAdd(id, config, baseUrl, format, apiKey); }); rl.close(); }
      else { rl.close(); finishAdd(id, config, baseUrl, format, apiKey); }
    });
  } else {
    finishAdd(id, config, baseUrl, format, apiKey);
  }
}

function finishAdd(id: string, config: Record<string, ProviderEntry>, baseUrl: string, format: string, apiKey: string): void {
  if (!baseUrl) { console.error(c("red", "✗ baseUrl required")); process.exit(1); }
  if (!format || !SUPPORTED_FORMATS.includes(format)) {
    console.error(c("red", `✗ format must be one of: ${SUPPORTED_FORMATS.join(", ")}`));
    process.exit(1);
  }
  config[id] = {
    id,
    baseUrl,
    format,
    apiKey: apiKey === "none" ? "" : apiKey,
    noAuth: apiKey === "none",
    addedAt: new Date().toISOString(),
  };
  saveConfig(config);
  console.log(c("green", `✓ Provider "${id}" added`));
  console.log(c("dim", `  ${baseUrl} (${format})`));
}

function cmdList(): void {
  const config = loadConfig();
  const ids = Object.keys(config);
  if (ids.length === 0) {
    console.log(c("yellow", "No providers configured. Run: hera provider add <id>"));
    return;
  }
  console.log(c("bold", `\nConfigured providers (${ids.length}):\n`));
  for (const id of ids) {
    const p = config[id];
    const auth = p.noAuth ? c("dim", "no-auth") : c("green", "● api key");
    console.log(`  ${c("cyan", id.padEnd(20))} ${p.format.padEnd(18)} ${auth}`);
    console.log(`  ${"".padEnd(20)} ${c("dim", p.baseUrl)}`);
  }
  console.log();
}

function cmdRemove(id: string): void {
  const config = loadConfig();
  if (!config[id]) {
    console.error(c("red", `✗ Provider "${id}" not found`));
    process.exit(1);
  }
  delete config[id];
  saveConfig(config);
  console.log(c("green", `✓ Provider "${id}" removed`));
}

function cmdShow(id: string): void {
  const config = loadConfig();
  const p = config[id];
  if (!p) {
    console.error(c("red", `✗ Provider "${id}" not found`));
    process.exit(1);
  }
  const masked = p.apiKey ? `${p.apiKey.slice(0, 4)}...${p.apiKey.slice(-4)}` : "(none)";
  console.log(c("bold", `\nProvider: ${id}\n`));
  console.log(`  ${c("dim", "baseUrl:")}  ${p.baseUrl}`);
  console.log(`  ${c("dim", "format:")}   ${p.format}`);
  console.log(`  ${c("dim", "apiKey:")}   ${masked}`);
  console.log(`  ${c("dim", "noAuth:")}   ${p.noAuth ?? false}`);
  console.log(`  ${c("dim", "addedAt:")}  ${p.addedAt}\n`);
}

async function cmdTest(id: string, args: string[]): Promise<void> {
  const config = loadConfig();
  const p = config[id];
  if (!p) {
    console.error(c("red", `✗ Provider "${id}" not found`));
    process.exit(1);
  }
  // Parse --key
  let apiKey = p.apiKey;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key") apiKey = args[++i];
  }
  if (!apiKey && !p.noAuth) {
    console.error(c("red", "✗ No API key. Use --key or configure with add."));
    process.exit(1);
  }

  // Probe URL (strip /chat/completions or /messages suffix)
  const probeUrl = p.baseUrl.replace(/\/(chat\/completions|messages)$/, "") + "/models";
  const headers: Record<string, string> = {};
  if (!p.noAuth) {
    if (p.authHeader && p.authHeader !== "Authorization") {
      headers[p.authHeader] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }

  console.log(c("dim", `Probing ${probeUrl}...`));
  try {
    const res = await fetch(probeUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      console.log(c("green", `✓ Valid (HTTP ${res.status})`));
    } else if (res.status === 401 || res.status === 403) {
      console.log(c("red", `✗ Invalid API key (HTTP ${res.status})`));
      process.exit(1);
    } else {
      console.log(c("yellow", `⚠ HTTP ${res.status} (may still be valid; some providers return errors for /models)`));
    }
  } catch (err) {
    console.error(c("red", `✗ Network error: ${(err as Error).message}`));
    process.exit(1);
  }
}

async function cmdModels(id: string, args: string[]): Promise<void> {
  const config = loadConfig();
  const p = config[id];
  if (!p) {
    console.error(c("red", `✗ Provider "${id}" not found`));
    process.exit(1);
  }
  let apiKey = p.apiKey;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key") apiKey = args[++i];
  }

  const probeUrl = p.baseUrl.replace(/\/(chat\/completions|messages)$/, "") + "/models";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!p.noAuth && apiKey) {
    if (p.authHeader && p.authHeader !== "Authorization") {
      headers[p.authHeader] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }

  console.log(c("dim", `Fetching ${probeUrl}...`));
  try {
    const res = await fetch(probeUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(c("red", `✗ HTTP ${res.status}`));
      process.exit(1);
    }
    const data = (await res.json()) as { data?: Array<{ id: string }>; models?: Array<{ id: string; name?: string }> };
    const list = data.data ?? data.models ?? [];
    console.log(c("bold", `\nModels for "${id}" (${list.length}):\n`));
    for (const m of list.slice(0, 50)) {
      console.log(`  ${c("cyan", m.id)}`);
    }
    if (list.length > 50) console.log(c("dim", `  ... and ${list.length - 50} more`));
    console.log();
  } catch (err) {
    console.error(c("red", `✗ ${(err as Error).message}`));
    process.exit(1);
  }
}

function cmdFormats(): void {
  console.log(c("bold", "\nSupported provider formats:\n"));
  for (const f of SUPPORTED_FORMATS) {
    console.log(`  ${c("cyan", f.padEnd(20))} ${c("dim", formatDescription(f))}`);
  }
  console.log();
}

function formatDescription(f: string): string {
  const map: Record<string, string> = {
    openai: "OpenAI Chat Completions API (most providers)",
    claude: "Anthropic Messages API",
    gemini: "Google Gemini generateContent",
    "openai-responses": "OpenAI Responses API (/v1/responses)",
    antigravity: "Google Antigravity (Cloud Code envelope)",
    kiro: "Amazon Kiro (CodeWhisperer streaming)",
    cursor: "Cursor IDE (Connect protocol)",
    ollama: "Ollama /api/chat",
  };
  return map[f] ?? "";
}

// Main
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  showHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const sub = args[0];
const rest = args.slice(1);
const id = rest[0];
const subArgs = rest.slice(1);

(async () => {
  try {
    switch (sub) {
      case "add":
        if (id) cmdAdd(id, subArgs);
        else { console.error(c("red", "✗ Usage: hera provider add <id>")); process.exit(1); }
        break;
      case "list": cmdList(); break;
      case "remove":
        if (id) cmdRemove(id);
        else { console.error(c("red", "✗ Usage: hera provider remove <id>")); process.exit(1); }
        break;
      case "show":
        if (id) cmdShow(id);
        else { console.error(c("red", "✗ Usage: hera provider show <id>")); process.exit(1); }
        break;
      case "test":
        if (id) await cmdTest(id, subArgs);
        else { console.error(c("red", "✗ Usage: hera provider test <id>")); process.exit(1); }
        break;
      case "models":
        if (id) await cmdModels(id, subArgs);
        else { console.error(c("red", "✗ Usage: hera provider models <id>")); process.exit(1); }
        break;
      case "formats": cmdFormats(); break;
      default: console.error(c("red", `✗ Unknown subcommand: ${sub}`)); showHelp(); process.exit(1);
    }
  } catch (err) {
    console.error(c("red", `✗ ${(err as Error).message}`));
    process.exit(1);
  }
})();
