/**
 * Hera Validation Checks
 *
 * Pure functions that detect architectural patterns in agent codebases.
 * Each check is a function from source code string to boolean.
 *
 * Checks may include a `hint` field with a concrete code example or fix
 * suggestion. Hints are shown alongside messages when a check fails.
 */

export interface Check {
  name: string;
  check: (code: string) => boolean;
  message: string;
  /** Optional actionable fix (code snippet or specific suggestion). */
  hint?: string;
}

export type CheckCategory =
  | "coreArchitecture"
  | "messageSystem"
  | "toolSystem"
  | "sessionSystem"
  | "errorHandling"
  | "security"
  | "streaming"
  | "quality"
  | "routing";

export const CHECKS: Record<CheckCategory, Check[]> = {
  // Core Architecture
  coreArchitecture: [
    {
      name: "Agent loop has two-loop design",
      check: (code: string) => code.includes("outer") && code.includes("inner"),
      message: "Agent loop should have outer (follow-up) and inner (steering) loops",
      hint: "Use nested while loops: outer for follow-up messages, inner for steering/cancellation",
    },
    {
      name: "Agent class wraps loop",
      check: (code: string) => code.includes("class Agent") || code.includes("classAgent"),
      message: "Should have an Agent class that wraps the agent loop",
      hint: "class Agent { constructor() { this.loop = new AgentLoop(); } }",
    },
    {
      name: "Agent harness wraps agent",
      check: (code: string) => code.includes("class AgentHarness") || code.includes("Harness"),
      message: "Should have an AgentHarness class for orchestration",
      hint: "class AgentHarness { private agent: Agent; ... } — orchestrates sessions, tools, providers",
    },
    {
      name: "Context is immutable",
      check: (code: string) =>
        code.includes("slice()") || code.includes("copy") || code.includes("structuredClone"),
      message: "Context should be copied before each turn (slice/copy/structuredClone)",
      hint: "const nextCtx = structuredClone(ctx); // safe snapshot for this turn",
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
      hint: "function run(opts: { signal: AbortSignal }) { if (opts.signal.aborted) return; }",
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
      hint: "declare module '../types' { interface CustomAgentMessages { myType: MyType; } }",
    },
    {
      name: "convertToLlm never throws",
      check: (code: string) => {
        if (!code.includes("convertToLlm")) return true;
        return !code.includes("throw") || code.includes("catch") || code.includes("try");
      },
      message: "convertToLlm should not throw — use safe fallbacks",
      hint: "function convertToLlm(m) { try { return adapt(m); } catch { return defaultMsg; } }",
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
      hint: "{ name: 'read', description: 'Read a file from disk' }",
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
      hint: "import { Type } from '@sinclair/typebox'; const schema = Type.Object({ path: Type.String() });",
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
      hint: "interface Node { id: string; parentId: string | null; ... }",
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
      hint: "return { isError: true, content: [{ type: 'text', text: err.message }] };",
    },
    {
      name: "Retry logic exists",
      check: (code: string) =>
        code.includes("retry") || code.includes("backoff") || code.includes("attempt"),
      message: "Should have retry logic for transient failures",
      hint: "async function withRetry(fn, { attempts = 3, backoff = 100 }) { ... }",
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
      hint: "spawn('bash', ['-c', cmd], { cwd: '/sandbox', timeout: 30_000 })",
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
      hint: "Redact secrets before logging: console.log({ ...req, apiKey: '[REDACTED]' });",
    },
  ],

  // Streaming & Concurrency
  streaming: [
    {
      name: "Streaming response (AsyncIterable)",
      check: (code: string) =>
        code.includes("AsyncIterable") ||
        code.includes("for await") ||
        code.includes("asyncIterator") ||
        code.includes("ReadableStream"),
      message: "Should support streaming responses (AsyncIterable / for await)",
      hint: "async *call(ctx) { for await (const chunk of provider.stream(ctx)) yield chunk; }",
    },
    {
      name: "Cancellation propagation",
      check: (code: string) =>
        code.includes("throwIfAborted") ||
        code.includes("signal.addEventListener") ||
        code.includes("signal.onabort") ||
        code.includes("signal.addEventListener('abort'"),
      message: "Should propagate AbortSignal through async operations",
      hint: "signal.addEventListener('abort', () => controller.abort());",
    },
    {
      name: "Token usage tracking",
      check: (code: string) =>
        code.includes("usage") ||
        code.includes("total_tokens") ||
        code.includes("prompt_tokens") ||
        code.includes("tokensUsed"),
      message: "Should track token usage (usage.total_tokens / prompt_tokens)",
      hint: "const total = response.usage.input_tokens + response.usage.output_tokens;",
    },
  ],

  // Routing & Multi-Key (inspired by 9router)
  routing: [
    {
      name: "Multi-key pool supported",
      check: (code: string) =>
        code.includes("apiKey") ||
        code.includes("api_key") ||
        code.includes("ApiKey") ||
        code.includes("accounts") ||
        code.includes("keyPool"),
      message: "Should support a pool of API keys per provider",
      hint: "interface ApiKey { id: string; key: string; rateLimitedUntil?: string; }",
    },
    {
      name: "Key cooldown (rate-limit awareness)",
      check: (code: string) =>
        code.includes("rateLimitedUntil") ||
        code.includes("rate_limited_until") ||
        code.includes("cooldown") ||
        code.includes("unavailableUntil"),
      message: "Should track per-key cooldown (skip rate-limited keys)",
      hint: "rateLimitedUntil: new Date(Date.now() + cooldownMs).toISOString()",
    },
    {
      name: "Round-robin or fallback strategy",
      check: (code: string) =>
        code.includes("round-robin") ||
        code.includes("roundRobin") ||
        code.includes("stickyLimit") ||
        code.includes("consecutiveUseCount") ||
        code.includes("strategy") ||
        code.includes("fallback"),
      message: "Should support a fallback/rotation strategy across keys",
      hint: 'strategy: "fallback" | "round-robin" with optional stickyLimit',
    },
    {
      name: "Exponential backoff on errors",
      check: (code: string) =>
        (code.includes("backoff") || code.includes("Backoff")) &&
        (code.includes("2 **") || code.includes("Math.pow") || code.includes("exponential")),
      message: "Should use exponential backoff for rate-limit errors (2s -> 4s -> 8s)",
      hint: "const cooldown = base * 2 ** level;  // exponential",
    },
    {
      name: "Config-driven error classification",
      check: (code: string) =>
        code.includes("ERROR_RULES") ||
        code.includes("errorRules") ||
        code.includes("errorConfig") ||
        (code.includes("cooldownMs") && code.includes("backoff")),
      message: "Should classify errors via config rules (text + status), not hardcoded",
      hint: "const RULES = [{text:'rate limit', backoff:true}, {status:429, backoff:true}];",
    },
  ],

  // Quality (tests, CI, observability, cost)
  quality: [
    {
      name: "Test suite exists",
      check: (code: string) =>
        code.includes(".test.ts") ||
        code.includes(".test.js") ||
        code.includes("vitest") ||
        code.includes("jest") ||
        code.includes("describe(") ||
        code.includes("it("),
      message: "Should have a test suite (vitest/jest/*.test.ts)",
      hint: "tests/foo.test.ts: import { describe, it, expect } from 'vitest'",
    },
    {
      name: "CI workflow configured",
      check: (code: string) =>
        code.includes(".github/workflows") ||
        code.includes("on: [push") ||
        code.includes("on:\\n  push:") ||
        code.includes("runs-on:") ||
        code.includes("actions/checkout"),
      message: "Should have CI configured (.github/workflows/*.yml)",
      hint: ".github/workflows/ci.yml: on: [push, pull_request]; jobs: test: runs-on: ubuntu-latest",
    },
    {
      name: "Provider fallback",
      check: (code: string) =>
        (code.includes("try {") || code.includes("catch")) &&
        (code.includes("fallback") || code.includes("primary") || code.includes("secondary")),
      message: "Should have a provider fallback chain (try/catch + primary/secondary)",
      hint: "try { return await primary.call(ctx); } catch { return await fallback.call(ctx); }",
    },
    {
      name: "Cost guard",
      check: (code: string) =>
        code.includes("budget") ||
        code.includes("cost") ||
        code.includes("maxTokens") ||
        code.includes("limit"),
      message: "Should guard against runaway cost (budget / maxTokens / limit)",
      hint: "if (totalCost > budget) return { isError: true, content: [...] };",
    },
    {
      name: "Observability (logging/metrics)",
      check: (code: string) =>
        code.includes("logger") ||
        code.includes("metrics") ||
        code.includes("telemetry") ||
        code.includes("console.debug") ||
        code.includes("console.info"),
      message: "Should emit logs/metrics for observability",
      hint: "logger.info({ event: 'tool_call', name, duration });",
    },
  ],
};
