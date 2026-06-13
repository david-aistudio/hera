/**
 * Agent Loop — Core loop implementation
 *
 * Two-loop design:
 * - Outer loop: handles follow-up messages
 * - Inner loop: handles tool calls and steering
 */

import type { AgentContext, AgentMessage, Tool, ToolCall, ToolResult } from "./types.js";

interface LLMResponse {
  content: { type: "text" | "toolCall"; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }[];
  stopReason: "end_turn" | "tool_use" | "error";
}

interface AgentLoopConfig {
  maxToolCalls?: number;
  maxFollowUps?: number;
}

export async function agentLoop(
  context: AgentContext,
  callLLM: (context: AgentContext) => Promise<LLMResponse>,
  config: AgentLoopConfig = {},
): Promise<AgentMessage[]> {
  const { maxToolCalls = 10, maxFollowUps = 5 } = config;
  const newMessages: AgentMessage[] = [];
  let followUpCount = 0;

  // Outer loop: handle follow-up messages
  while (followUpCount < maxFollowUps) {
    let hasMoreToolCalls = true;
    let toolCallCount = 0;

    // Inner loop: handle tool calls and steering
    while (hasMoreToolCalls && toolCallCount < maxToolCalls) {
      // Call LLM
      const response = await callLLM(context);

      // Create assistant message
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: response.content,
        timestamp: Date.now(),
      };

      context.messages.push(assistantMessage);
      newMessages.push(assistantMessage);

      // Check for tool calls
      const toolCalls = response.content.filter((c): c is ToolCall => c.type === "toolCall");

      if (toolCalls.length === 0) {
        // No tool calls — check for follow-up messages
        hasMoreToolCalls = false;
        break;
      }

      // Execute tools
      const toolResults: ToolResult[] = [];

      for (const toolCall of toolCalls) {
        const tool = context.tools?.find((t) => t.name === toolCall.name);

        if (!tool) {
          toolResults.push({
            toolCallId: toolCall.id!,
            content: [{ type: "text", text: `Tool "${toolCall.name}" not found` }],
            isError: true,
          });
          continue;
        }

        try {
          const result = await tool.execute(toolCall.arguments || {});
          toolResults.push({
            toolCallId: toolCall.id!,
            content: [{ type: "text", text: result }],
            isError: false,
          });
        } catch (error) {
          toolResults.push({
            toolCallId: toolCall.id!,
            content: [{ type: "text", text: `Error: ${error}` }],
            isError: true,
          });
        }

        toolCallCount++;
      }

      // Add tool results to context
      const toolResultMessage: AgentMessage = {
        role: "toolResult",
        content: toolResults,
        timestamp: Date.now(),
      };

      context.messages.push(toolResultMessage);
      newMessages.push(toolResultMessage);
    }

    // Check for follow-up messages (simulated — in production, check queue)
    // For this example, we break after first turn
    break;
  }

  return newMessages;
}
