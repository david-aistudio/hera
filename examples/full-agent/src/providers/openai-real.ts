/**
 * OpenAI Provider — Real API client for OpenAI-compatible endpoints
 *
 * Works with: OpenAI, MiniMax-M3 (via TokenRouter), vLLM, LiteLLM, etc.
 */

import type { AgentContext, ToolCall, TextContent } from "../agent/types.js";

interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function createRealOpenAIProvider(config: OpenAIConfig) {
  const { apiKey, model, baseUrl } = config;

  return {
    async call(context: AgentContext) {
      // Build messages array
      const messages: Array<Record<string, unknown>> = [];

      // System prompt
      if (context.systemPrompt) {
        messages.push({ role: "system", content: context.systemPrompt });
      }

      // Convert agent messages to OpenAI format
      for (const msg of context.messages) {
        if (msg.role === "user") {
          const text = msg.content
            .filter((c): c is TextContent => c.type === "text")
            .map((c) => c.text)
            .join("\n");
          messages.push({ role: "user", content: text });
        } else if (msg.role === "assistant") {
          const textParts: string[] = [];
          const toolCalls: Array<Record<string, unknown>> = [];

          for (const part of msg.content) {
            if (part.type === "text") {
              textParts.push(part.text);
            } else if (part.type === "toolCall") {
              toolCalls.push({
                id: part.id,
                type: "function",
                function: {
                  name: part.name,
                  arguments:
                    typeof part.arguments === "string"
                      ? part.arguments
                      : JSON.stringify(part.arguments ?? {}),
                },
              });
            }
          }

          const entry: Record<string, unknown> = { role: "assistant" };
          if (textParts.length > 0) {
            entry.content = textParts.join("\n");
          }
          if (toolCalls.length > 0) {
            entry.tool_calls = toolCalls;
          }
          messages.push(entry);
        } else if (msg.role === "toolResult") {
          for (const part of msg.content) {
            if ("toolCallId" in part) {
              messages.push({
                role: "tool",
                tool_call_id: part.toolCallId,
                content: part.content?.[0]?.text ?? "",
              });
            }
          }
        }
      }

      // Build tools array
      const tools = (context.tools ?? []).map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
              content: {
                type: "string",
                description: "File content (for write)",
              },
              command: {
                type: "string",
                description: "Shell command (for bash)",
              },
            },
            required: [],
          },
        },
      }));

      // Call API
      const url = `${baseUrl}/chat/completions`;
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: 4096,
      };

      if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const start = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const durationMs = Date.now() - start;
      const choice = data.choices?.[0];

      if (!choice) {
        throw new Error("No choices in API response");
      }

      // Log usage
      const usage = data.usage;
      if (usage) {
        console.log(
          `  [${model}] tokens: ${usage.total_tokens} (${usage.prompt_tokens} in + ${usage.completion_tokens} out) | ${durationMs}ms`
        );
      }

      // Parse response
      const content: Array<TextContent | ToolCall> = [];

      if (choice.message?.content) {
        // Strip <think>...</think> tags if present
        let text = choice.message.content;
        text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
        if (text) {
          content.push({ type: "text", text });
        }
      }

      if (choice.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args =
              typeof tc.function.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
          } catch {
            args = {};
          }
          content.push({
            type: "toolCall",
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        }
      }

      return {
        content,
        stopReason:
          choice.finish_reason === "tool_calls" || choice.finish_reason === "tool_use"
            ? ("tool_use" as const)
            : ("end_turn" as const),
      };
    },
  };
}
