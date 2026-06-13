/**
 * Core types for the agent
 */

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: TextContent[];
  isError: boolean;
  terminate?: boolean;
}

export interface AgentMessage {
  role: "user" | "assistant" | "toolResult";
  content: (TextContent | ToolCall | ToolResult)[];
  timestamp: number;
}

export interface AgentContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools?: Tool[];
}

export interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}
