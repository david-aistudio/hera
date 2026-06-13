/**
 * Agent Class — Stateful wrapper around agent loop
 */

import { agentLoop } from "./loop.js";
import type { AgentContext, AgentMessage, Tool } from "./types.js";

interface AgentOptions {
  provider: {
    call: (context: AgentContext) => Promise<{
      content: { type: "text" | "toolCall"; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }[];
      stopReason: "end_turn" | "tool_use" | "error";
    }>;
  };
  tools: Tool[];
  session: {
    appendMessage: (message: AgentMessage) => void;
    getMessages: () => AgentMessage[];
  };
  extensionRunner?: {
    emit: (type: string, data: unknown) => Promise<void>;
  };
  systemPrompt: string;
}

export function createAgent(options: AgentOptions) {
  const { provider, tools, session, extensionRunner, systemPrompt } = options;

  return {
    async prompt(text: string): Promise<string> {
      // Create user message
      const userMessage: AgentMessage = {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      // Emit event
      await extensionRunner?.emit("before_agent_start", {});

      // Build context
      const context: AgentContext = {
        systemPrompt,
        messages: [...session.getMessages(), userMessage],
        tools,
      };

      // Run agent loop
      const messages = await agentLoop(context, provider.call);

      // Save messages to session
      session.appendMessage(userMessage);
      for (const msg of messages) {
        session.appendMessage(msg);
      }

      // Emit event
      await extensionRunner?.emit("after_agent_end", {});

      // Extract response text
      const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
      if (!lastAssistant) return "No response";

      return lastAssistant.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
    },
  };
}
