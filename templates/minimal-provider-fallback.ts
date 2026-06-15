/**
 * Minimal Provider Router — Hera Architecture Reference (TypeScript)
 *
 * Inspired by 9router (decolua/9router) — a production AI router with:
 * - Multi-key pool per provider
 * - Round-robin strategy (with sticky limit)
 * - Account-level cooldown (skip rate-limited accounts)
 * - Exponential backoff per key
 * - Per-model lock (separate from account cooldown)
 * - Config-driven error classification
 *
 * Based on:
 * - 9router: open-sse/services/combo.js
 * - 9router: open-sse/services/accountFallback.js
 * - 9router: open-sse/config/errorConfig.js
 *
 * Provides two strategies:
 * - "fallback"   — try primary, then secondary, etc. (sequential)
 * - "round-robin" — rotate with optional sticky limit (N requests per key)
 */

// ============================================================================
// Inline types
// ============================================================================

interface AgentContext {
  systemPrompt: string;
  messages: Array<{ role: string; content: unknown }>;
}

interface ContentBlock {
  type: "text" | "toolCall";
  text?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

interface CallResult {
  content: ContentBlock[];
  usage?: { inputTokens: number; outputTokens: number };
}

/** A single API key/account, with its current cooldown state. */
export interface ApiKey {
  id: string;
  key: string;
  rateLimitedUntil?: string;     // ISO timestamp; if in future, skip this key
  backoffLevel?: number;          // For exponential backoff (0, 1, 2, ...)
  lastError?: { status: number; message: string; timestamp: string };
}

/** Strategy for picking a key. */
export type Strategy = "fallback" | "round-robin";

export interface RouterConfig {
  /** Pool of API keys for this provider. (Optional here; ProviderRouter constructor takes keys as a separate param.) */
  keys?: ApiKey[];
  /** Strategy (default: "fallback"). */
  strategy?: Strategy;
  /**
   * Sticky limit for round-robin — number of consecutive requests
   * to use the same key before rotating. Default 1.
   * Set to N to "stick" to the same key for N requests.
   */
  stickyLimit?: number;
  /** Max attempts before giving up (default: 3). */
  maxAttempts?: number;
  /** Backoff base in ms (default: 2000). */
  backoffMs?: number;
  /** Backoff max in ms (default: 5 * 60 * 1000 = 5 minutes). */
  backoffMaxMs?: number;
  /** Cooldown for transient/unknown errors in ms (default: 30_000). */
  transientCooldownMs?: number;
  /** Optional per-model lock TTL — locks a key for a specific model. */
  modelLockTtlMs?: number;
}

// ============================================================================
// Error classification
// ============================================================================

/** Error classification rule. Checked top-to-bottom. */
export interface ErrorRule {
  /** Substring match in error text (case-insensitive). */
  text?: string;
  /** HTTP status code to match. */
  status?: number;
  /** Fixed cooldown in ms. */
  cooldownMs?: number;
  /** If true, use exponential backoff instead of fixed cooldown. */
  backoff?: boolean;
}

/**
 * Default error rules (from 9router's errorConfig.js).
 * Order matters — text rules checked first, then status.
 */
export const DEFAULT_ERROR_RULES: ErrorRule[] = [
  // Text-based
  { text: "no credentials",          cooldownMs: 2 * 60 * 1000 },
  { text: "improperly formed request", cooldownMs: 2 * 60 * 1000 },
  { text: "rate limit",              backoff: true },
  { text: "too many requests",       backoff: true },
  { text: "quota exceeded",          backoff: true },
  { text: "capacity",                backoff: true },
  { text: "overloaded",              backoff: true },
  // Status-based
  { status: 401, cooldownMs: 2 * 60 * 1000 },
  { status: 403, cooldownMs: 2 * 60 * 1000 },
  { status: 404, cooldownMs: 2 * 60 * 1000 },
  { status: 429, backoff: true },
];

/** Cooldown for non-fallback (terminal) errors. */
const NON_FALLBACK_STATUSES = new Set([400]);

export function checkFallbackError(
  status: number,
  errorText: string,
  backoffLevel: number,
  rules: ErrorRule[] = DEFAULT_ERROR_RULES,
  backoffBase = 2000,
  backoffMax = 5 * 60 * 1000,
  transientCooldown = 30_000,
  maxLevel = 15
): { shouldFallback: boolean; cooldownMs: number; newBackoffLevel?: number } {
  // Terminal errors — don't fall back
  if (NON_FALLBACK_STATUSES.has(status)) {
    return { shouldFallback: false, cooldownMs: 0 };
  }

  const lower = (errorText || "").toLowerCase();

  for (const rule of rules) {
    // Text match (case-insensitive)
    if (rule.text && lower.includes(rule.text)) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, maxLevel);
        return {
          shouldFallback: true,
          cooldownMs: computeBackoff(newLevel, backoffBase, backoffMax),
          newBackoffLevel: newLevel,
        };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs ?? transientCooldown };
    }
    // Status match
    if (rule.status === status) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, maxLevel);
        return {
          shouldFallback: true,
          cooldownMs: computeBackoff(newLevel, backoffBase, backoffMax),
          newBackoffLevel: newLevel,
        };
      }
      return { shouldFallback: true, cooldownMs: rule.cooldownMs ?? transientCooldown };
    }
  }

  // Default: transient cooldown
  return { shouldFallback: true, cooldownMs: transientCooldown };
}

function computeBackoff(level: number, base: number, max: number): number {
  // level=1 → base, level=2 → base*2, level=3 → base*4, ...
  const ms = base * 2 ** Math.max(0, level - 1);
  return Math.min(ms, max);
}

// ============================================================================
// Per-key state
// ============================================================================

function isKeyAvailable(key: ApiKey): boolean {
  if (!key.rateLimitedUntil) return true;
  return new Date(key.rateLimitedUntil).getTime() <= Date.now();
}

/** Filter out keys in cooldown. */
export function filterAvailableKeys(keys: ApiKey[]): ApiKey[] {
  return keys.filter(isKeyAvailable);
}

function applyErrorState(
  key: ApiKey,
  status: number,
  errorText: string,
  config: Required<RouterConfig>
): ApiKey {
  const backoffLevel = key.backoffLevel ?? 0;
  const { cooldownMs, newBackoffLevel } = checkFallbackError(
    status,
    errorText,
    backoffLevel,
    DEFAULT_ERROR_RULES,
    config.backoffMs,
    config.backoffMaxMs,
    config.transientCooldownMs
  );

  return {
    ...key,
    rateLimitedUntil: cooldownMs > 0
      ? new Date(Date.now() + cooldownMs).toISOString()
      : undefined,
    backoffLevel: newBackoffLevel ?? backoffLevel,
    lastError: { status, message: errorText, timestamp: new Date().toISOString() },
  };
}

function resetKeyState(key: ApiKey): ApiKey {
  return {
    ...key,
    rateLimitedUntil: undefined,
    backoffLevel: 0,
    lastError: undefined,
  };
}

// ============================================================================
// Round-robin state (per RouterConfig instance, keyed by route name)
// ============================================================================

/** Track rotation state: how many requests used current key, and which key index. */
interface RotationState {
  index: number;
  consecutiveUseCount: number;
}

/** Sticky state — same key for N consecutive requests. */
const stickyStates = new Map<string, RotationState>();

/** Get next key based on strategy. Returns null if all keys unavailable. */
function pickNextKey(
  keys: ApiKey[],
  stateKey: string,
  strategy: Strategy,
  stickyLimit: number
): { key: ApiKey; nextState: RotationState } | null {
  const available = filterAvailableKeys(keys);
  if (available.length === 0) return null;

  if (strategy === "fallback" || available.length === 1) {
    // Always pick the first available
    return { key: available[0], nextState: { index: 0, consecutiveUseCount: 0 } };
  }

  // round-robin with sticky limit
  const state = stickyStates.get(stateKey) ?? { index: 0, consecutiveUseCount: 0 };
  const currentKey = keys[state.index % keys.length];

  // If current key is still in cooldown, find next available
  let selectedIdx = state.index % keys.length;
  if (!isKeyAvailable(currentKey)) {
    // Find next available starting from current index
    for (let i = 0; i < keys.length; i++) {
      const idx = (state.index + i) % keys.length;
      if (isKeyAvailable(keys[idx])) {
        selectedIdx = idx;
        break;
      }
    }
  }

  const newConsecutive = state.consecutiveUseCount + 1;
  const nextState: RotationState =
    newConsecutive >= stickyLimit
      ? { index: (selectedIdx + 1) % keys.length, consecutiveUseCount: 0 }
      : { index: selectedIdx, consecutiveUseCount: newConsecutive };

  return { key: keys[selectedIdx], nextState };
}

// ============================================================================
// Provider interface (must be implemented by your actual provider)
// ============================================================================

export interface ProviderCall {
  (ctx: AgentContext, key: ApiKey): Promise<CallResult>;
}

// ============================================================================
// ProviderRouter — main class
// ============================================================================

export class ProviderRouter {
  private keys: ApiKey[];
  private config: Required<RouterConfig>;
  private providerCall: ProviderCall;
  private routeName: string;

  constructor(
    routeName: string,
    keys: ApiKey[],
    providerCall: ProviderCall,
    config: RouterConfig = {}
  ) {
    if (keys.length === 0) throw new Error("ProviderRouter requires at least 1 key");
    this.routeName = routeName;
    this.keys = keys;
    this.providerCall = providerCall;
    this.config = {
      keys,
      strategy: config.strategy ?? "fallback",
      stickyLimit: config.stickyLimit ?? 1,
      maxAttempts: config.maxAttempts ?? 3,
      backoffMs: config.backoffMs ?? 2000,
      backoffMaxMs: config.backoffMaxMs ?? 5 * 60 * 1000,
      transientCooldownMs: config.transientCooldownMs ?? 30_000,
      modelLockTtlMs: config.modelLockTtlMs ?? 0,
    };
  }

  /** Update the key pool (e.g., when user adds/removes a key). */
  setKeys(keys: ApiKey[]): void {
    if (keys.length === 0) throw new Error("Need at least 1 key");
    this.keys = keys;
    this.config.keys = keys;
  }

  /** Get current key pool state (for UI/observability). */
  getKeyStates(): Array<{ id: string; available: boolean; lastError?: ApiKey["lastError"] }> {
    return this.keys.map((k) => ({
      id: k.id,
      available: isKeyAvailable(k),
      lastError: k.lastError,
    }));
  }

  /** Reset all key states (e.g., on app restart). */
  resetAll(): void {
    this.keys = this.keys.map(resetKeyState);
    stickyStates.clear();
  }

  /** Make a call. Tries keys in order (fallback) or rotates (round-robin). */
  async call(ctx: AgentContext): Promise<CallResult> {
    const { strategy, stickyLimit, maxAttempts } = this.config;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt++;

      const pick = pickNextKey(this.keys, this.routeName, strategy, stickyLimit);
      if (!pick) {
        throw new Error(`No available keys for route "${this.routeName}" (all in cooldown)`);
      }

      // Save rotation state
      stickyStates.set(this.routeName, pick.nextState);

      try {
        const result = await this.providerCall(ctx, pick.key);

        // Success: reset this key's state
        this.keys = this.keys.map((k) => (k.id === pick.key.id ? resetKeyState(k) : k));

        return result;
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? err?.response?.status ?? 500;
        const message = err?.message ?? String(err);

        // Apply error state to this key
        this.keys = this.keys.map((k) =>
          k.id === pick.key.id ? applyErrorState(k, status, message, this.config) : k
        );

        const { shouldFallback } = checkFallbackError(
          status,
          message,
          pick.key.backoffLevel ?? 0,
          DEFAULT_ERROR_RULES,
          this.config.backoffMs,
          this.config.backoffMaxMs,
          this.config.transientCooldownMs
        );

        if (!shouldFallback) {
          throw err;  // Terminal — don't try other keys
        }

        // If last attempt, throw
        if (attempt >= maxAttempts) {
          throw new Error(
            `All ${maxAttempts} attempts failed for "${this.routeName}". Last: ${message}`
          );
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

// ============================================================================
// Example usage
// ============================================================================

// // 1. Define a provider call function (your actual API client)
// const callOpenAI: ProviderCall = async (ctx, key) => {
//   const response = await fetch("https://api.openai.com/v1/chat/completions", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" },
//     body: JSON.stringify({ model: "gpt-4o-mini", messages: ctx.messages }),
//   });
//   if (!response.ok) throw Object.assign(new Error(await response.text()), { status: response.status });
//   const data = await response.json();
//   return { content: [{ type: "text", text: data.choices[0].message.content }] };
// };
//
// // 2. Create router with 3 keys, round-robin with stickyLimit=2
// const router = new ProviderRouter("openai-gpt4o", [
//   { id: "key-1", key: process.env.OPENAI_KEY_1! },
//   { id: "key-2", key: process.env.OPENAI_KEY_2! },
//   { id: "key-3", key: process.env.OPENAI_KEY_3! },
// ], callOpenAI, { strategy: "round-robin", stickyLimit: 2 });
//
// // 3. Make calls
// const result = await router.call({ systemPrompt: "...", messages: [...] });
//
// // 4. Check key states
// console.log(router.getKeyStates());
