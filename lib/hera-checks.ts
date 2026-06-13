/**
 * Hera Validation Checks
 *
 * Pure functions that detect architectural patterns in agent codebases.
 * Each check is a function from source code string to boolean.
 */

export interface Check {
  name: string;
  check: (code: string) => boolean;
  message: string;
}

export type CheckCategory =
  | "coreArchitecture"
  | "messageSystem"
  | "toolSystem"
  | "sessionSystem"
  | "errorHandling"
  | "security";

export const CHECKS: Record<CheckCategory, Check[]> = {
  // Core Architecture
  coreArchitecture: [
    {
      name: "Agent loop has two-loop design",
      check: (code: string) => code.includes("outer") && code.includes("inner"),
      message: "Agent loop should have outer (follow-up) and inner (steering) loops",
    },
    {
      name: "Agent class wraps loop",
      check: (code: string) => code.includes("class Agent") || code.includes("classAgent"),
      message: "Should have an Agent class that wraps the agent loop",
    },
    {
      name: "Agent harness wraps agent",
      check: (code: string) => code.includes("class AgentHarness") || code.includes("Harness"),
      message: "Should have an AgentHarness class for orchestration",
    },
    {
      name: "Context is immutable",
      check: (code: string) =>
        code.includes("slice()") || code.includes("copy") || code.includes("structuredClone"),
      message: "Context should be copied before each turn (slice/copy/structuredClone)",
    },
    {
      name: "Events emitted in order",
      check: (code: string) => code.includes("emit") || code.includes("event"),
      message: "Should emit events for lifecycle tracking",
    },
    {
      name: "AbortSignal respected",
      check: (code: string) =>
        code.includes("AbortSignal") || code.includes("signal") || code.includes("abort"),
      message: "Should respect AbortSignal for cancellation",
    },
  ],

  // Message System
  messageSystem: [
    {
      name: "AgentMessage type defined",
      check: (code: string) => code.includes("AgentMessage") || code.includes("Message"),
      message: "Should define AgentMessage type",
    },
    {
      name: "Custom messages via declaration merging",
      check: (code: string) =>
        code.includes("declare module") || code.includes("CustomAgentMessages"),
      message: "Should support custom messages via declaration merging",
    },
    {
      name: "convertToLlm never throws",
      check: (code: string) => {
        if (!code.includes("convertToLlm")) return true;
        return !code.includes("throw") || code.includes("catch") || code.includes("try");
      },
      message: "convertToLlm should not throw — use safe fallbacks",
    },
    {
      name: "bashExecution handling",
      check: (code: string) => code.includes("bashExecution") || code.includes("bash"),
      message: "Should handle bashExecution messages",
    },
  ],

  // Tool System
  toolSystem: [
    {
      name: "Tools have name and description",
      check: (code: string) => {
        if (!code.includes("Tool") && !code.includes("tool")) return true;
        return code.includes("name") && code.includes("description");
      },
      message: "Tools should have name and description",
    },
    {
      name: "Tools have execute function",
      check: (code: string) => code.includes("execute") || code.includes("function execute"),
      message: "Tools should have an execute function",
    },
    {
      name: "Tool parameters validated",
      check: (code: string) =>
        code.includes("TypeBox") || code.includes("schema") || code.includes("validate"),
      message: "Tool parameters should be validated (TypeBox or similar)",
    },
    {
      name: "Parallel execution support",
      check: (code: string) => code.includes("parallel") || code.includes("Promise.all"),
      message: "Should support parallel tool execution",
    },
    {
      name: "Sequential execution support",
      check: (code: string) => code.includes("sequential") || /\bfor\b.*\bof\b/.test(code),
      message: "Should support sequential tool execution",
    },
  ],

  // Session System
  sessionSystem: [
    {
      name: "Session is tree-based",
      check: (code: string) => {
        if (!code.includes("Session") && !code.includes("session")) return true;
        return code.includes("parentId") || code.includes("parent") || code.includes("tree");
      },
      message: "Session should be tree-based (not linear log)",
    },
    {
      name: "Session supports branching",
      check: (code: string) =>
        code.includes("fork") || code.includes("branch") || code.includes("switch"),
      message: "Session should support branching (fork/switch)",
    },
    {
      name: "Context building from tree",
      check: (code: string) => code.includes("buildContext") || code.includes("getPathToRoot"),
      message: "Should build context by walking tree to root",
    },
  ],

  // Error Handling
  errorHandling: [
    {
      name: "Tool errors become error results",
      check: (code: string) => {
        if (!code.includes("tool") && !code.includes("Tool")) return true;
        return code.includes("isError") || code.includes("error result");
      },
      message: "Tool errors should become error results, not exceptions",
    },
    {
      name: "Retry logic exists",
      check: (code: string) =>
        code.includes("retry") || code.includes("backoff") || code.includes("attempt"),
      message: "Should have retry logic for transient failures",
    },
    {
      name: "Graceful degradation",
      check: (code: string) =>
        code.includes("fallback") || code.includes("degradat") || code.includes("partial"),
      message: "Should handle failures gracefully",
    },
  ],

  // Security
  security: [
    {
      name: "Tool execution sandboxed",
      check: (code: string) => {
        if (!code.includes("bash") && !code.includes("Bash")) return true;
        return code.includes("cwd") || code.includes("sandbox") || code.includes("restrict");
      },
      message: "Bash tool should be sandboxed (cwd-based)",
    },
    {
      name: "Input validation exists",
      check: (code: string) =>
        code.includes("validate") || code.includes("sanitize") || code.includes("schema"),
      message: "Should validate user input",
    },
    {
      name: "API keys not logged",
      check: (code: string) => {
        if (!code.includes("apiKey") && !code.includes("api_key")) return true;
        return !code.includes("console.log(apiKey") && !code.includes("console.log(api_key");
      },
      message: "API keys should never be logged",
    },
  ],
};
