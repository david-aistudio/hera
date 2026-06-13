/**
 * OpenAI Provider - Simulated for example
 */

import type { AgentContext } from "../agent/types.js";

export function createOpenAIProvider() {
  return {
    async call(context: AgentContext) {
      const lastMessage = context.messages[context.messages.length - 1];
      const text = (lastMessage?.content?.[0] as any)?.text ?? "";

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

      if (text.toLowerCase().includes("create") || text.toLowerCase().includes("write")) {
        return {
          content: [
            { type: "text" as const, text: "I will create that file for you." },
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

      const reply = 'I received: "' + text + '". How can I help?';
      return {
        content: [{ type: "text" as const, text: reply }],
        stopReason: "end_turn" as const,
      };
    },
  };
}
