/**
 * Tests for minimal-provider-fallback.ts
 *
 * Covers the patterns from 9router's accountFallback + combo:
 * - Multi-key pool with cooldown
 * - Round-robin with sticky limit
 * - Fallback strategy (sequential)
 * - Exponential backoff
 * - Filter available keys (skip cooldown)
 * - Error rules (text + status matching)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ProviderRouter,
  filterAvailableKeys,
  checkFallbackError,
  DEFAULT_ERROR_RULES,
  ApiKey,
  ProviderCall,
  RouterConfig,
} from "../../templates/minimal-provider-fallback";

function makeKey(id: string, key = `sk-${id}`): ApiKey {
  return { id, key };
}

function makeFailingCall(status: number, message = "fail"): ProviderCall {
  return async () => {
    const err: any = new Error(message);
    err.status = status;
    throw err;
  };
}

function makeSucceedingCall(result: any = { content: [] }): ProviderCall {
  return async () => result;
}

describe("filterAvailableKeys", () => {
  it("returns all keys when none are rate-limited", () => {
    const keys = [makeKey("a"), makeKey("b"), makeKey("c")];
    expect(filterAvailableKeys(keys)).toHaveLength(3);
  });

  it("excludes keys in active cooldown", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const keys: ApiKey[] = [
      makeKey("a"),
      { ...makeKey("b"), rateLimitedUntil: future },  // in cooldown
      { ...makeKey("c"), rateLimitedUntil: past },    // expired
    ];
    const available = filterAvailableKeys(keys);
    expect(available.map((k) => k.id)).toEqual(["a", "c"]);
  });
});

describe("checkFallbackError", () => {
  it("flags 400 as non-fallback (terminal)", () => {
    const result = checkFallbackError(400, "bad request", 0, DEFAULT_ERROR_RULES);
    expect(result.shouldFallback).toBe(false);
  });

  it("returns fixed cooldown for 401", () => {
    const result = checkFallbackError(401, "unauthorized", 0, DEFAULT_ERROR_RULES);
    expect(result.shouldFallback).toBe(true);
    expect(result.cooldownMs).toBe(120_000);  // 2 minutes
  });

  it("uses exponential backoff for 429", () => {
    // First 429: 2s
    const r1 = checkFallbackError(429, "rate limit", 0, DEFAULT_ERROR_RULES);
    expect(r1.cooldownMs).toBe(2000);

    // Second 429: 4s (level 2)
    const r2 = checkFallbackError(429, "rate limit", 1, DEFAULT_ERROR_RULES);
    expect(r2.cooldownMs).toBe(4000);

    // Third 429: 8s (level 3)
    const r3 = checkFallbackError(429, "rate limit", 2, DEFAULT_ERROR_RULES);
    expect(r3.cooldownMs).toBe(8000);
  });

  it("matches text rules case-insensitively", () => {
    const result = checkFallbackError(500, "RATE LIMIT exceeded", 0, DEFAULT_ERROR_RULES);
    expect(result.shouldFallback).toBe(true);
    expect(result.cooldownMs).toBe(2000);
  });

  it("returns transient cooldown for unknown errors", () => {
    const result = checkFallbackError(500, "something weird", 0, DEFAULT_ERROR_RULES);
    expect(result.cooldownMs).toBe(30_000);
  });
});

describe("ProviderRouter — fallback strategy", () => {
  it("picks first key when strategy is fallback", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const router = new ProviderRouter("test", [makeKey("k1"), makeKey("k2")], callFn, {
      strategy: "fallback",
    });
    await router.call({ systemPrompt: "", messages: [] });
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn.mock.calls[0][1].id).toBe("k1");
  });

  it("tries next key on 401", async () => {
    const callFn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }))
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });
    const router = new ProviderRouter("test", [makeKey("k1"), makeKey("k2")], callFn, {
      strategy: "fallback",
      maxAttempts: 3,
    });
    const result = await router.call({ systemPrompt: "", messages: [] });
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(result.content[0].text).toBe("ok");
  });

  it("marks failed keys as in-cooldown", async () => {
    const callFn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }))
      .mockResolvedValueOnce({ content: [] });
    const router = new ProviderRouter("test", [makeKey("k1"), makeKey("k2")], callFn, {
      strategy: "fallback",
    });
    await router.call({ systemPrompt: "", messages: [] });
    const states = router.getKeyStates();
    expect(states[0].available).toBe(false);  // k1 cooldown
    expect(states[1].available).toBe(true);   // k2 ok
  });

  it("resets successful key state", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const router = new ProviderRouter("test", [makeKey("k1")], callFn, {
      strategy: "fallback",
    });
    await router.call({ systemPrompt: "", messages: [] });
    const states = router.getKeyStates();
    expect(states[0].available).toBe(true);
    expect(states[0].lastError).toBeUndefined();
  });

  it("throws when all keys are unavailable", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const future = new Date(Date.now() + 60_000).toISOString();
    const router = new ProviderRouter(
      "test",
      [{ ...makeKey("k1"), rateLimitedUntil: future }],
      callFn,
      { strategy: "fallback" }
    );
    await expect(router.call({ systemPrompt: "", messages: [] })).rejects.toThrow(
      /No available keys/
    );
  });
});

describe("ProviderRouter — round-robin with sticky", () => {
  it("rotates keys after stickyLimit requests", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const router = new ProviderRouter(
      "rr",
      [makeKey("k1"), makeKey("k2"), makeKey("k3")],
      callFn,
      { strategy: "round-robin", stickyLimit: 1 }
    );

    // Each call should pick the next key (stickyLimit=1 means rotate every call)
    await router.call({ systemPrompt: "", messages: [] });
    await router.call({ systemPrompt: "", messages: [] });
    await router.call({ systemPrompt: "", messages: [] });

    expect(callFn.mock.calls[0][1].id).toBe("k1");
    expect(callFn.mock.calls[1][1].id).toBe("k2");
    expect(callFn.mock.calls[2][1].id).toBe("k3");
  });

  it("sticks to same key for stickyLimit=2", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const router = new ProviderRouter(
      "rr-sticky",
      [makeKey("k1"), makeKey("k2")],
      callFn,
      { strategy: "round-robin", stickyLimit: 2 }
    );

    await router.call({ systemPrompt: "", messages: [] });
    await router.call({ systemPrompt: "", messages: [] });
    // After 2 requests on k1, switch to k2
    await router.call({ systemPrompt: "", messages: [] });

    expect(callFn.mock.calls[0][1].id).toBe("k1");
    expect(callFn.mock.calls[1][1].id).toBe("k1");
    expect(callFn.mock.calls[2][1].id).toBe("k2");
  });

  it("skips keys in cooldown during round-robin", async () => {
    const callFn = vi.fn().mockResolvedValue({ content: [] });
    const future = new Date(Date.now() + 60_000).toISOString();
    const router = new ProviderRouter(
      "rr-cooldown",
      [
        makeKey("k1"),
        { ...makeKey("k2"), rateLimitedUntil: future },  // in cooldown
        makeKey("k3"),
      ],
      callFn,
      { strategy: "round-robin", stickyLimit: 1 }
    );

    await router.call({ systemPrompt: "", messages: [] });
    expect(callFn.mock.calls[0][1].id).toBe("k1");
  });
});

describe("ProviderRouter — error handling", () => {
  it("rethrows on 400 (terminal error)", async () => {
    const callFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    const router = new ProviderRouter("test", [makeKey("k1")], callFn, {
      strategy: "fallback",
      maxAttempts: 3,
    });
    await expect(router.call({ systemPrompt: "", messages: [] })).rejects.toThrow(
      /bad request/
    );
    expect(callFn).toHaveBeenCalledTimes(1);  // didn't retry
  });

  it("gives up after maxAttempts (multi-key)", async () => {
    const callFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));
    const router = new ProviderRouter("test", [makeKey("k1"), makeKey("k2"), makeKey("k3")], callFn, {
      strategy: "fallback",
      maxAttempts: 2,
    });
    await expect(router.call({ systemPrompt: "", messages: [] })).rejects.toThrow(
      /All 2 attempts/
    );
  });
});

describe("ProviderRouter — management", () => {
  it("resetAll clears all cooldowns", async () => {
    const callFn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }))
      .mockResolvedValueOnce({ content: [] });
    const router = new ProviderRouter("test", [makeKey("k1"), makeKey("k2")], callFn, {
      strategy: "fallback",
    });
    await router.call({ systemPrompt: "", messages: [] });
    expect(router.getKeyStates()[0].available).toBe(false);
    router.resetAll();
    expect(router.getKeyStates()[0].available).toBe(true);
  });

  it("setKeys replaces the pool", () => {
    const callFn = vi.fn();
    const router = new ProviderRouter("test", [makeKey("k1")], callFn);
    router.setKeys([makeKey("a"), makeKey("b")]);
    expect(router.getKeyStates()).toHaveLength(2);
  });
});
