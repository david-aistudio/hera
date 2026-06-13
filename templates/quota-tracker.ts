/**
 * quota-tracker.ts
 *
 * Quota tracking per provider/model/account with persistence hooks.
 * Extracted from 9router src/lib/usage/* (usageRepo.js, quotaTracker.js).
 *
 * Usage:
 *   const tracker = new QuotaTracker();
 *   tracker.record("openai", "gpt-5.4", "account-0", { inputTokens: 100, outputTokens: 50 });
 *   const summary = tracker.summarize();
 */

export interface QuotaUsage {
  timestamp: number;
  provider: string;
  model: string;
  accountId: string;
  inputTokens: number;
  outputTokens: number;
  cost?: number;          // in USD
  requestCount?: number;   // default 1
}

export interface QuotaLimit {
  provider: string;
  model?: string;          // if null, applies to all models on provider
  accountId?: string;       // if null, applies to all accounts
  maxRequestsPerMinute?: number;
  maxRequestsPerDay?: number;
  maxTokensPerDay?: number;
  maxCostPerDay?: number;
}

export interface QuotaSummary {
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  byAccount: Record<string, { requests: number; tokens: number; cost: number }>;
  byDay: Record<string, { requests: number; tokens: number; cost: number }>;
}

export class QuotaTracker {
  private records: QuotaUsage[] = [];
  private limits: QuotaLimit[] = [];
  private persistHook?: (records: QuotaUsage[]) => Promise<void> | void;

  constructor(opts: { limits?: QuotaLimit[]; persist?: (records: QuotaUsage[]) => Promise<void> | void } = {}) {
    this.limits = opts.limits ?? [];
    this.persistHook = opts.persist;
  }

  record(usage: Omit<QuotaUsage, "timestamp" | "requestCount">): void {
    this.records.push({ ...usage, timestamp: Date.now(), requestCount: 1 });
    if (this.persistHook) {
      // Fire and forget (or could be awaited)
      Promise.resolve(this.persistHook(this.records)).catch(() => {});
    }
  }

  addLimit(limit: QuotaLimit): void {
    this.limits.push(limit);
  }

  // Check if a request would exceed limits; returns { ok: boolean, reason?: string }
  checkLimit(provider: string, model: string, accountId: string, estimatedTokens = 0): { ok: boolean; reason?: string } {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneDayAgo = now - 86_400_000;

    for (const limit of this.limits) {
      if (limit.provider !== provider) continue;
      if (limit.model && limit.model !== model) continue;
      if (limit.accountId && limit.accountId !== accountId) continue;

      // Per-minute check
      if (limit.maxRequestsPerMinute) {
        const recentReqs = this.records.filter((r) =>
          r.provider === provider &&
          (!limit.model || r.model === model) &&
          (!limit.accountId || r.accountId === accountId) &&
          r.timestamp > oneMinuteAgo,
        ).length;
        if (recentReqs >= limit.maxRequestsPerMinute) {
          return { ok: false, reason: `Rate limit: ${recentReqs}/${limit.maxRequestsPerMinute} req/min exceeded for ${provider}/${model ?? "*"}/${accountId ?? "*"}` };
        }
      }

      // Per-day request check
      if (limit.maxRequestsPerDay) {
        const dayReqs = this.records.filter((r) =>
          r.provider === provider &&
          (!limit.model || r.model === model) &&
          (!limit.accountId || r.accountId === accountId) &&
          r.timestamp > oneDayAgo,
        ).length;
        if (dayReqs >= limit.maxRequestsPerDay) {
          return { ok: false, reason: `Daily limit: ${dayReqs}/${limit.maxRequestsPerDay} req/day exceeded` };
        }
      }

      // Per-day token check
      if (limit.maxTokensPerDay) {
        const dayTokens = this.records.filter((r) =>
          r.provider === provider &&
          (!limit.model || r.model === model) &&
          (!limit.accountId || r.accountId === accountId) &&
          r.timestamp > oneDayAgo,
        ).reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
        if (dayTokens + estimatedTokens > limit.maxTokensPerDay) {
          return { ok: false, reason: `Daily token limit: ${dayTokens + estimatedTokens}/${limit.maxTokensPerDay} exceeded` };
        }
      }

      // Per-day cost check
      if (limit.maxCostPerDay) {
        const dayCost = this.records.filter((r) =>
          r.provider === provider &&
          (!limit.model || r.model === model) &&
          (!limit.accountId || r.accountId === accountId) &&
          r.timestamp > oneDayAgo,
        ).reduce((sum, r) => sum + (r.cost ?? 0), 0);
        if (dayCost > limit.maxCostPerDay) {
          return { ok: false, reason: `Daily cost limit: $${dayCost.toFixed(2)}/$${limit.maxCostPerDay} exceeded` };
        }
      }
    }

    return { ok: true };
  }

  summarize(sinceMs?: number): QuotaSummary {
    const cutoff = sinceMs ?? 0;
    const filtered = this.records.filter((r) => r.timestamp >= cutoff);

    const summary: QuotaSummary = {
      byProvider: {},
      byModel: {},
      byAccount: {},
      byDay: {},
    };

    for (const r of filtered) {
      const tokens = r.inputTokens + r.outputTokens;
      const cost = r.cost ?? 0;

      if (!summary.byProvider[r.provider]) summary.byProvider[r.provider] = { requests: 0, tokens: 0, cost: 0 };
      summary.byProvider[r.provider].requests++;
      summary.byProvider[r.provider].tokens += tokens;
      summary.byProvider[r.provider].cost += cost;

      const modelKey = `${r.provider}/${r.model}`;
      if (!summary.byModel[modelKey]) summary.byModel[modelKey] = { requests: 0, tokens: 0, cost: 0 };
      summary.byModel[modelKey].requests++;
      summary.byModel[modelKey].tokens += tokens;
      summary.byModel[modelKey].cost += cost;

      if (!summary.byAccount[r.accountId]) summary.byAccount[r.accountId] = { requests: 0, tokens: 0, cost: 0 };
      summary.byAccount[r.accountId].requests++;
      summary.byAccount[r.accountId].tokens += tokens;
      summary.byAccount[r.accountId].cost += cost;

      const day = new Date(r.timestamp).toISOString().slice(0, 10);
      if (!summary.byDay[day]) summary.byDay[day] = { requests: 0, tokens: 0, cost: 0 };
      summary.byDay[day].requests++;
      summary.byDay[day].tokens += tokens;
      summary.byDay[day].cost += cost;
    }

    return summary;
  }

  recent(limit = 50): QuotaUsage[] {
    return this.records.slice(-limit);
  }

  clear(): void {
    this.records = [];
  }
}
