/**
 * Example Agent — Entry point
 *
 * Complete AI coding agent built with Hera Framework.
 * Demonstrates all patterns from the architecture reference.
 */

import { createAgent } from "./agent/index.js";
import { createTools } from "./tools/index.js";
import { createSession } from "./session/index.js";
import { createProvider } from "./providers/index.js";
import { createExtensionRunner } from "./extensions/index.js";
import { createLoggingExtension } from "./extensions/logging.js";
import { createSecurityExtension } from "./extensions/security.js";

async function main() {
  console.log("🤖 Hera Example Agent\n");

  // Create provider
  const provider = createProvider();

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
    systemPrompt: `You are a helpful coding assistant. You can read, write, and edit files.
Always show file paths clearly when working with files.
Be concise in your responses.`,
  });

  // Example conversation
  console.log("User: Hello! What can you help me with?");
  const response1 = await agent.prompt("Hello! What can you help me with?");
  console.log("Agent:", response1);
  console.log();

  console.log("User: Read the README.md file");
  const response2 = await agent.prompt("Read the README.md file");
  console.log("Agent:", response2);
  console.log();

  console.log("User: Create a new file called hello.txt with 'Hello World'");
  const response3 = await agent.prompt("Create a new file called hello.txt with 'Hello World'");
  console.log("Agent:", response3);
  console.log();

  // Show session info
  const messages = session.getMessages();
  console.log(`\nSession: ${messages.length} messages`);
}

main().catch(console.error);
