/**
 * tunnel.ts
 *
 * Tunnel manager core. Abstract over tunnel providers (Cloudflare, Tailscale, etc.)
 * with health check, watchdog (auto-reconnect), and state persistence.
 *
 * Source: 9router src/lib/tunnel/* (manager.js + shared/state.js + healthCheck.js)
 *
 * Usage:
 *   import { TunnelManager, CloudflareTunnelProvider, TailscaleFunnelProvider } from "./tunnel";
 *
 *   const manager = new TunnelManager({ statePath: ".hera/tunnel.json" });
 *   manager.registerProvider("cloudflare", new CloudflareTunnelProvider({ dataDir: ".hera" }));
 *   manager.registerProvider("tailscale", new TailscaleFunnelProvider());
 *
 *   const info = await manager.start("cloudflare", 20128);
 *   console.log("Public URL:", info.publicUrl);
 *
 *   // Later: stop
 *   await manager.stop("cloudflare");
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, chmodSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export interface TunnelInfo {
  provider: string;
  localPort: number;
  publicUrl: string;                  // The public URL exposed
  shortId?: string;                   // Short ID (for Cloudflare quick tunnel subdomain)
  startedAt: number;
  pid?: number;
}

export interface TunnelProvider {
  readonly name: string;
  /** Start a tunnel exposing localPort. Returns TunnelInfo. */
  start(localPort: number, opts?: StartOptions): Promise<TunnelInfo>;
  /** Stop the tunnel gracefully. */
  stop(): Promise<void>;
  /** Whether the tunnel process is running. */
  isRunning(): boolean;
  /** Get the current public URL (null if not started). */
  getPublicUrl(): string | null;
  /** Subscribe to unexpected exit events (for watchdog). */
  onUnexpectedExit(cb: () => void): void;
  /** Optional: probe the public URL to verify it's actually serving. */
  probeHealth?(timeoutMs?: number): Promise<boolean>;
}

export interface StartOptions {
  /** If true, replace an existing tunnel for the same provider. */
  force?: boolean;
  /** Custom state key (e.g. for multi-tunnel per provider). */
  key?: string;
  /** Watchdog enabled. If true, auto-reconnect on unexpected exit. */
  watchdog?: boolean;
  /** Cooldown between watchdog respawns (ms). */
  respawnCooldownMs?: number;
  /** Health check after start (probe /api/health or similar). */
  healthCheck?: boolean;
  /** Max wait for health check to pass (ms). */
  healthTimeoutMs?: number;
}

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

export interface TunnelState {
  provider: string;
  localPort: number;
  publicUrl: string;
  shortId?: string;
  startedAt: number;
  pid?: number;
}

const SHORT_ID_LENGTH = 6;
const SHORT_ID_CHARS = "abcdefghijklmnpqrstuvwxyz23456789"; // omit confusing chars (0/o, 1/l/i)

export function generateShortId(): string {
  const bytes = randomBytes(SHORT_ID_LENGTH);
  let result = "";
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    result += SHORT_ID_CHARS[bytes[i] % SHORT_ID_CHARS.length];
  }
  return result;
}

export function loadTunnelState(path: string): TunnelState | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as TunnelState;
  } catch {
    return null;
  }
}

export function saveTunnelState(path: string, state: TunnelState): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function clearTunnelState(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* ignore */ }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface HealthCheckOptions {
  intervalMs?: number;                 // polling interval (default 2000)
  timeoutMs?: number;                  // max wait (default 60000)
  fetchTimeoutMs?: number;            // per-probe fetch timeout (default 5000)
  healthPath?: string;                 // path to probe (default /api/health)
}

export async function probeUrlAlive(url: string, opts: HealthCheckOptions = {}): Promise<boolean> {
  if (!url) return false;
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? 5_000;
  const healthPath = opts.healthPath ?? "/api/health";
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}${healthPath}`, {
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(
  url: string,
  opts: HealthCheckOptions & { cancelToken?: { cancelled: boolean } } = {},
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 2_000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const cancelToken = opts.cancelToken ?? { cancelled: false };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cancelToken.cancelled) throw new Error("cancelled");
    if (await probeUrlAlive(url, opts)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ============================================================================
// INTERNET CHECK
// ============================================================================

export async function checkInternet(testUrl = "https://1.1.1.1"): Promise<boolean> {
  try {
    const res = await fetch(testUrl, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

// ============================================================================
// DNS RESOLVER
// ============================================================================

export async function resolveDns(hostname: string, timeoutMs = 3_000): Promise<boolean> {
  // Use DoH (DNS over HTTPS) for cross-platform resolution
  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { Status?: number; Answer?: unknown[] };
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// TUNNEL MANAGER
// ============================================================================

export interface TunnelManagerOptions {
  statePath?: string;                  // default ".hera/tunnel-state.json"
  defaultRespawnCooldownMs?: number;   // default 60_000
  defaultHealthTimeoutMs?: number;     // default 60_000
}

interface ManagedTunnel {
  provider: TunnelProvider;
  info: TunnelInfo | null;
  cancelToken: { cancelled: boolean };
  watchdogTimer?: NodeJS.Timeout;
  lastRespawnAt: number;
  respawnCooldownMs: number;
  watchdogEnabled: boolean;
}

export class TunnelManager {
  private providers = new Map<string, TunnelProvider>();
  private managed = new Map<string, ManagedTunnel>();
  private statePath: string;
  private defaultRespawnCooldownMs: number;
  private defaultHealthTimeoutMs: number;
  private hooks: Array<{ event: string; fn: (data: unknown) => void }> = [];

  constructor(opts: TunnelManagerOptions = {}) {
    this.statePath = opts.statePath ?? join(process.cwd(), ".hera", "tunnel-state.json");
    this.defaultRespawnCooldownMs = opts.defaultRespawnCooldownMs ?? 60_000;
    this.defaultHealthTimeoutMs = opts.defaultHealthTimeoutMs ?? 60_000;
  }

  registerProvider(name: string, provider: TunnelProvider): void {
    if (provider.name !== name) {
      // Auto-align name
      Object.defineProperty(provider, "name", { value: name, configurable: true });
    }
    this.providers.set(name, provider);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // === Start a tunnel ===
  async start(providerName: string, localPort: number, opts: StartOptions = {}): Promise<TunnelInfo> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown tunnel provider: ${providerName}`);

    // Check existing managed tunnel
    const existing = this.managed.get(providerName);
    if (existing && provider.isRunning() && !opts.force) {
      if (existing.info) return existing.info;
    }

    // If force, stop existing
    if (opts.force && provider.isRunning()) {
      await provider.stop();
    }

    // Verify internet
    if (!(await checkInternet())) {
      throw new Error("No internet connection");
    }

    // Start provider
    const cancelToken = { cancelled: false };
    const respawnCooldownMs = opts.respawnCooldownMs ?? this.defaultRespawnCooldownMs;
    const watchdogEnabled = opts.healthCheck ?? opts.watchdog ?? true;

    const info = await provider.start(localPort, opts);

    const managed: ManagedTunnel = {
      provider,
      info,
      cancelToken,
      lastRespawnAt: 0,
      respawnCooldownMs,
      watchdogEnabled,
    };

    // Register unexpected exit callback (for watchdog)
    provider.onUnexpectedExit(() => this.handleUnexpectedExit(providerName));

    this.managed.set(providerName, managed);

    // Persist state
    saveTunnelState(this.statePath, info);

    // Optional: wait for health
    if (opts.healthCheck !== false) {
      const ok = await waitForHealth(info.publicUrl, { timeoutMs: opts.healthTimeoutMs ?? this.defaultHealthTimeoutMs, cancelToken });
      if (!ok) {
        // Don't fail — tunnel may still be functional, just not exposing /api/health
        // But log a warning
        // eslint-disable-next-line no-console
        console.warn(`[tunnel:${providerName}] health check did not pass within timeout, continuing anyway`);
      }
    }

    return info;
  }

  // === Stop a tunnel ===
  async stop(providerName: string): Promise<void> {
    const managed = this.managed.get(providerName);
    if (!managed) return;
    managed.cancelToken.cancelled = true;
    if (managed.watchdogTimer) clearTimeout(managed.watchdogTimer);
    await managed.provider.stop();
    managed.info = null;
    this.managed.delete(providerName);
    clearTunnelState(this.statePath);
  }

  // === Stop all ===
  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.managed.keys()).map((name) => this.stop(name)));
  }

  // === Get current info ===
  getInfo(providerName: string): TunnelInfo | null {
    return this.managed.get(providerName)?.info ?? null;
  }

  getAll(): Record<string, TunnelInfo | null> {
    const out: Record<string, TunnelInfo | null> = {};
    for (const [name, managed] of this.managed) out[name] = managed.info;
    return out;
  }

  // === Watchdog handler ===
  private handleUnexpectedExit(providerName: string): void {
    const managed = this.managed.get(providerName);
    if (!managed || managed.cancelToken.cancelled || !managed.watchdogEnabled) return;

    const now = Date.now();
    if (now - managed.lastRespawnAt < managed.respawnCooldownMs) {
      // eslint-disable-next-line no-console
      console.warn(`[tunnel:${providerName}] respawn within cooldown, skipping`);
      return;
    }
    managed.lastRespawnAt = now;

    // eslint-disable-next-line no-console
    console.log(`[tunnel:${providerName}] unexpected exit, respawning in 5s`);

    // Schedule respawn
    if (managed.watchdogTimer) clearTimeout(managed.watchdogTimer);
    managed.watchdogTimer = setTimeout(async () => {
      if (managed.cancelToken.cancelled) return;
      try {
        if (!managed.info) return;
        const newInfo = await managed.provider.start(managed.info.localPort);
        managed.info = newInfo;
        saveTunnelState(this.statePath, newInfo);
        // eslint-disable-next-line no-console
        console.log(`[tunnel:${providerName}] respawned: ${newInfo.publicUrl}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[tunnel:${providerName}] respawn failed:`, err);
      }
    }, 5_000);
  }
}
