/**
 * Minimal Agent Loop — Hera Architecture Reference
 *
 * This is the simplest possible agent loop implementation.
 * It demonstrates the core concept: call LLM → check for tools → execute → repeat.
 *
 * Based on Pi Agent's agent-loop.ts (packages/agent/src/agent-loop.ts)
 * Verified from source code at /root/pi-agent
 */

// ============================================================================
// Types
// ============================================================================

interface TextContent {
  type: "text";
  text: string;
}

interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResultContent {
  type: "toolResult";
  toolCallId: string;
  content: TextContent[];
  isError: boolean;
}

type Message =
  | { role: "user"; content: TextContent[] }
  | { role: "assistant"; content: (TextContent | ToolCallContent)[] }
  | { role: "toolResult"; content: ToolResultContent[] };

interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface AgentContext {
  systemPrompt: string;
  messages: Message[];
  tools: Tool[];
}

interface LLMResponse {
  content: (TextContent | ToolCallContent)[];
  stopReason: "end_turn" | "tool_use" | "error";
}

// ============================================================================
// LLM Provider (mock — replace with real implementation)
// ============================================================================

async function callLLM(context: AgentContext): Promise<LLMResponse> {
  // In production, this calls OpenAI/Anthropic/etc.
  // For this minimal example, we simulate a response.
  console.log(`[LLM] Calling with ${context.messages.length} messages, ${context.tools.length} tools`);

  // Simulate: if last message was a tool result, return text
  const lastMessage = context.messages[context.messages.length - 1];
  if (lastMessage?.role === "toolResult") {
    return {
      content: [{ type: "text", text: "I've executed the tool. Here's what happened." }],
      stopReason: "end_turn",
    };
  }

  // Simulate: call a tool
  return {
    content: [
      { type: "text", text: "Let me use a tool to help." },
      {
        type: "toolCall",
        id: "call_1",
        name: context.tools[0]?.name ?? "unknown",
        arguments: { input: "test" },
      },
    ],
    stopReason: "tool_use",
  };
}

// ============================================================================
// Agent Loop (core — this is the heart of the agent)
// ============================================================================

async function agentLoop(context: AgentContext): Promise<Message[]> {
  const newMessages: Message[] = [];
  let hasMoreToolCalls = true;

  while (hasMoreToolCalls) {
    // 1. Call LLM
    const response = await callLLM(context);

    // 2. Create assistant message
    const assistantMessage: Message = {
      role: "assistant",
      content: response.content,
    };
    context.messages.push(assistantMessage);
    newMessages.push(assistantMessage);

    // 3. Check for tool calls
    const toolCalls = response.content.filter((c): c is ToolCallContent => c.type === "toolCall");

    if (toolCalls.length === 0) {
      // No tool calls — agent is done
      hasMoreToolCalls = false;
      break;
    }

    // 4. Execute tools
    const toolResults: ToolResultContent[] = [];

    for (const toolCall of toolCalls) {
      const tool = context.tools.find((t) => t.name === toolCall.name);

      if (!tool) {
        // Tool not found
        toolResults.push({
          toolCallId: toolCall.id,
          content: [{ type: "text", text: `Tool "${toolCall.name}" not found` }],
          isError: true,
        });
        continue;
      }

      try {
        // Execute tool
        const result = await tool.execute(toolCall.arguments);
        toolResults.push({
          toolCallId: toolCall.id,
          content: [{ type: "text", text: result }],
          isError: false,
        });
      } catch (error) {
        // Tool execution failed
        toolResults.push({
          toolCallId: toolCall.id,
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        });
      }
    }

    // 5. Add tool results to context
    const toolResultMessage: Message = {
      role: "toolResult",
      content: toolResults,
    };
    context.messages.push(toolResultMessage);
    newMessages.push(toolResultMessage);

    // 6. Loop back to LLM with tool results
  }

  return newMessages;
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  // Define tools
  const tools: Tool[] = [
    {
      name: "read_file",
      description: "Read a file",
      execute: async (args) => {
        return `Contents of ${args.input}: [file contents here]`;
      },
    },
  ];

  // Create context
  const context: AgentContext = {
    systemPrompt: "You are a helpful coding assistant.",
    messages: [{ role: "user", content: [{ type: "text", text: "Read the file README.md" }] }],
    tools,
  };

  // Run agent loop
  const messages = await agentLoop(context);

  // Print results
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") {
          console.log(`[Assistant] ${part.text}`);
        } else if (part.type === "toolCall") {
          console.log(`[Tool Call] ${part.name}(${JSON.stringify(part.arguments)})`);
        }
      }
    } else if (msg.role === "toolResult") {
      for (const result of msg.content) {
        console.log(`[Tool Result] ${result.content[0]?.text}`);
      }
    }
  }
}

main().catch(console.error);
