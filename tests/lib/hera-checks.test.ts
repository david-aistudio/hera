/**
 * Tests for lib/hera-checks.ts
 *
 * Verifies that each architectural check correctly detects patterns
 * in source code.
 */

import { describe, it, expect } from "vitest";
import { CHECKS } from "../../lib/hera-checks.js";

describe("hera-checks: coreArchitecture", () => {
  const checks = CHECKS.coreArchitecture;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("detects two-loop design (outer + inner)", () => {
    const code = `function loop() { while(true) { /* outer */ /* inner */ } }`;
    expect(findCheck("Agent loop has two-loop design").check(code)).toBe(true);
  });

  it("flags missing two-loop design", () => {
    const code = `function loop() { while(true) { doStuff(); } }`;
    expect(findCheck("Agent loop has two-loop design").check(code)).toBe(false);
  });

  it("detects Agent class", () => {
    const code = `class Agent { run() {} }`;
    expect(findCheck("Agent class wraps loop").check(code)).toBe(true);
  });

  it("detects AgentHarness class", () => {
    const code = `class AgentHarness { constructor() {} }`;
    expect(findCheck("Agent harness wraps agent").check(code)).toBe(true);
  });

  it("detects AbortSignal usage", () => {
    const code = `function run(opts) { opts.signal.addEventListener('abort', () => {}); }`;
    expect(findCheck("AbortSignal respected").check(code)).toBe(true);
  });

  it("detects event emission", () => {
    const code = `this.emit('event', data);`;
    expect(findCheck("Events emitted in order").check(code)).toBe(true);
  });
});

describe("hera-checks: toolSystem", () => {
  const checks = CHECKS.toolSystem;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("detects tools with name and description", () => {
    const code = `const tool = { name: 'read', description: 'Read file' };`;
    expect(findCheck("Tools have name and description").check(code)).toBe(true);
  });

  it("detects execute function", () => {
    const code = `const tool = { execute: async () => {} };`;
    expect(findCheck("Tools have execute function").check(code)).toBe(true);
  });

  it("detects schema validation (TypeBox)", () => {
    const code = `import { Type } from '@sinclair/typebox'; const schema = Type.Object({});`;
    expect(findCheck("Tool parameters validated").check(code)).toBe(true);
  });

  it("detects parallel execution", () => {
    const code = `await Promise.all([tool1(), tool2()]);`;
    expect(findCheck("Parallel execution support").check(code)).toBe(true);
  });
});

describe("hera-checks: sessionSystem", () => {
  const checks = CHECKS.sessionSystem;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("detects tree-based session", () => {
    const code = `class Session { parentId: string; }`;
    expect(findCheck("Session is tree-based").check(code)).toBe(true);
  });

  it("detects branching", () => {
    const code = `session.fork('new-branch');`;
    expect(findCheck("Session supports branching").check(code)).toBe(true);
  });

  it("detects buildContext", () => {
    const code = `function buildContext(session) {}`;
    expect(findCheck("Context building from tree").check(code)).toBe(true);
  });
});

describe("hera-checks: security", () => {
  const checks = CHECKS.security;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("flags logged API keys", () => {
    const code = `const apiKey = 'sk-123'; console.log(apiKey);`;
    expect(findCheck("API keys not logged").check(code)).toBe(false);
  });

  it("passes when API key is used but not logged", () => {
    const code = `const apiKey = 'sk-123'; return fetch(url, { headers: { apiKey } });`;
    expect(findCheck("API keys not logged").check(code)).toBe(true);
  });

  it("passes when no API key present", () => {
    const code = `function fetchData() { return 42; }`;
    expect(findCheck("API keys not logged").check(code)).toBe(true);
  });
});

describe("hera-checks: errorHandling", () => {
  const checks = CHECKS.errorHandling;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("detects retry logic", () => {
    const code = `async function withRetry(fn, attempts = 3) {}`;
    expect(findCheck("Retry logic exists").check(code)).toBe(true);
  });

  it("detects graceful degradation", () => {
    const code = `try { await fetch() } catch { return fallback; }`;
    expect(findCheck("Graceful degradation").check(code)).toBe(true);
  });
});

describe("hera-checks: messageSystem", () => {
  const checks = CHECKS.messageSystem;
  const findCheck = (name: string) => checks.find((c) => c.name === name)!;

  it("passes convertToLlm with try/catch", () => {
    const code = `function convertToLlm(m) { try { return m; } catch { return null; } }`;
    expect(findCheck("convertToLlm never throws").check(code)).toBe(true);
  });

  it("flags convertToLlm that throws without try", () => {
    const code = `function convertToLlm(m) { throw new Error('bad'); return m; }`;
    expect(findCheck("convertToLlm never throws").check(code)).toBe(false);
  });

  it("passes when convertToLlm not present", () => {
    const code = `function other() {}`;
    expect(findCheck("convertToLlm never throws").check(code)).toBe(true);
  });
});

describe("hera-checks: streaming", () => {
  const findCheck = (name: string) => {
    for (const checks of Object.values(CHECKS)) {
      const c = checks.find((c) => c.name === name);
      if (c) return c;
    }
    throw new Error(`Check not found: ${name}`);
  };

  it("detects AsyncIterable streaming", () => {
    const code = `async function* call() { for await (const x of stream) yield x; }`;
    expect(findCheck("Streaming response (AsyncIterable)").check(code)).toBe(true);
  });

  it("flags missing streaming", () => {
    const code = `async function call() { return await provider.complete(); }`;
    expect(findCheck("Streaming response (AsyncIterable)").check(code)).toBe(false);
  });

  it("detects cancellation propagation", () => {
    const code = `signal.addEventListener('abort', () => ctrl.abort());`;
    expect(findCheck("Cancellation propagation").check(code)).toBe(true);
  });

  it("detects token usage tracking", () => {
    const code = `const total = response.usage.input_tokens + response.usage.output_tokens;`;
    expect(findCheck("Token usage tracking").check(code)).toBe(true);
  });
});

describe("hera-checks: quality", () => {
  const findCheck = (name: string) => {
    for (const checks of Object.values(CHECKS)) {
      const c = checks.find((c) => c.name === name);
      if (c) return c;
    }
    throw new Error(`Check not found: ${name}`);
  };

  it("detects test suite", () => {
    const code = `import { describe, it, expect } from 'vitest';`;
    expect(findCheck("Test suite exists").check(code)).toBe(true);
  });

  it("detects CI workflow", () => {
    const code = `runs-on: ubuntu-latest\nsteps:\n  - uses: actions/checkout@v4`;
    expect(findCheck("CI workflow configured").check(code)).toBe(true);
  });

  it("detects provider fallback", () => {
    const code = `try { return await primary.call(); } catch { return await fallback.call(); }`;
    expect(findCheck("Provider fallback").check(code)).toBe(true);
  });

  it("detects cost guard", () => {
    const code = `if (cost > budget) return { isError: true };`;
    expect(findCheck("Cost guard").check(code)).toBe(true);
  });

  it("detects observability", () => {
    const code = `logger.info({ event: 'tool_call', duration: 100 });`;
    expect(findCheck("Observability (logging/metrics)").check(code)).toBe(true);
  });
});

describe("hera-checks: shape contract", () => {
  it("has all 8 expected categories", () => {
    const expected = [
      "coreArchitecture",
      "messageSystem",
      "toolSystem",
      "sessionSystem",
      "errorHandling",
      "security",
      "streaming",
      "quality",
    ];
    expect(Object.keys(CHECKS).sort()).toEqual(expected.sort());
  });

  it("every check has name, check fn, and message", () => {
    for (const [category, checks] of Object.entries(CHECKS)) {
      for (const c of checks) {
        expect(c.name, `${category}: check missing name`).toBeTypeOf("string");
        expect(c.check, `${category}.${c.name}: missing check fn`).toBeTypeOf("function");
        expect(c.message, `${category}.${c.name}: missing message`).toBeTypeOf("string");
      }
    }
  });
});

describe("hera-checks: hint field", () => {
  it("some checks include an actionable hint", () => {
    let hintsFound = 0;
    for (const checks of Object.values(CHECKS)) {
      for (const c of checks) {
        if (c.hint && c.hint.length > 0) {
          hintsFound++;
          expect(c.hint, `${c.name} has empty hint`).toBeTypeOf("string");
        }
      }
    }
    // We added hints to many checks; require at least 6 to keep the
    // feature useful.
    expect(hintsFound, "expected at least 6 checks with hints").toBeGreaterThanOrEqual(6);
  });
});
