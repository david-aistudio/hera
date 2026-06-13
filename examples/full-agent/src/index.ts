/**
 * Example Agent — Entry point
 *
 * Complete AI coding agent built with Hera Framework.
 * Supports real API calls via --provider openai --base-url ... --model ...
 */

import { createAgent } from "./agent/index.js";
import { createTools } from "./tools/index.js";
import { createSession } from "./session/index.js";
import { createRealOpenAIProvider } from "./providers/openai-real.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { createExtensionRunner } from "./extensions/index.js";
import { createLoggingExtension } from "./extensions/logging.js";
import { createSecurityExtension } from "./extensions/security.js";

// Parse CLI args (supports both -m and --message)
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (!raw) continue;
    // Handle -m and --message
    const key = raw.replace(/^--?/, "");
    // Check if next arg is a value (not another flag)
    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      parsed[key] = next;
      i++; // skip value
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs();

  // Provider config from CLI or env
  const apiKey =
    args["api-key"] || process.env.HERA_API_KEY || "";
  const model = args["model"] || process.env.HERA_MODEL || "gpt-4o";
  const baseUrl =
    args["base-url"] ||
    process.env.HERA_BASE_URL ||
    "https://api.openai.com/v1";
  const message = args["message"] || args["m"] || "";

  // Create provider — real or simulated
  let provider;
  if (apiKey) {
    console.log(`🤖 Hera TS Agent | ${model} @ ${baseUrl}`);
    provider = createRealOpenAIProvider({ apiKey, model, baseUrl });
  } else {
    console.log("🤖 Hera Example Agent (simulated mode)");
    provider = createOpenAIProvider();
  }

  // Create tools
  const tools = createTools(process.cwd());

  // Create session
  const session = createSession();

  // Create extension runner
  const extensionRunner = createExtensionRunner();
  await extensionRunner.load([
    createLoggingExtension(),
    createSecurityExtension(),
  ]);

  // Create agent
  const agent = createAgent({
    provider,
    tools,
    session,
    extensionRunner,
    systemPrompt: `You are a helpful coding assistant. You can read, write, and edit files, and run shell commands with bash.
Always show file paths clearly when working with files.
Be concise in your responses.`,
  });

  if (message) {
    // Single message mode
    console.log(`\nUser: ${message}`);
    const response = await agent.prompt(message);
    console.log(`\nAgent: ${response}`);
  } else {
    // Demo mode
    console.log("\nUser: Hello! What can you help me with?");
    const response1 = await agent.prompt("Hello! What can you help me with?");
    console.log("Agent:", response1);
    console.log();

    console.log("User: Read the README.md file");
    const response2 = await agent.prompt("Read the README.md file");
    console.log("Agent:", response2);
    console.log();
  }

  // Show session info
  const messages = session.getMessages();
  console.log(`\nSession: ${messages.length} messages`);
}

main().catch(console.error);
