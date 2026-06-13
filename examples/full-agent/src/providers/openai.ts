/**
 * OpenAI Provider — Simulated for example
 */

import type { AgentContext } from "../agent/types.js";

export function createOpenAIProvider() {
  return {
    async call(context: AgentContext) {
      // In production, this would call the OpenAI API
      // For this example, simulate responses
      const lastMessage = context.messages[context.messages.length - 1];
      const text = (lastMessage?.content?.[0] as any)?.text ?? "";

      // Simulate: if user asks to read a file, call the read tool
      if (text.toLowerCase().includes("read")) {
        return {
          content: [
            { type: "text" as const, text: "Let me read that file for you." },
            {
              type: "toolCall" as const,
              id: "call_1",
              name: "read",
              arguments: { path: "README.md" },
            },
          ],
          stopReason: "tool_use" as const,
        };
      }

      // Simulate: if user asks to write, call the write tool
      if (text.toLowerCase().includes("create") || text.toLowerCase().includes("write")) {
        return {
          content: [
            { type: "text" as const, text: "I'll create that file for you." },
            {
              type: "toolCall" as const,
              id: "call_2",
              name: "write",
              arguments: { path: "hello.txt", content: "Hello World" },
            },
          ],
          stopReason: "tool_use" as const,
        };
      }

      // Default: just respond
      return {
        content: [{ type: "text" as const, text: \`I received: "\${text}". How can I help?\` }],
        stopReason: "end_turn" as const,
      };
    },
  };
}
