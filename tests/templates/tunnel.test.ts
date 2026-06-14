import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, unlinkSync } from "fs";
import {
  TunnelManager,
  loadTunnelState,
  saveTunnelState,
  generateShortId,
  probeUrlAlive,
  waitForHealth,
  checkInternet,
  resolveDns,
  clearTunnelState,
  type TunnelProvider,
  type TunnelInfo,
} from "../../templates/tunnel.js";
import { CloudflareTunnelProvider, getDownloadUrl, getBinaryPath } from "../../templates/tunnel-cloudflare.js";

// ============================================================
// STATE HELPERS
// ============================================================
describe("tunnel state helpers", () => {
  it("generates 6-char short IDs from safe alphabet", () => {
    const id = generateShortId();
    expect(id).toMatch(/^[a-z2-9]{6}$/);
    // Should NOT contain chars that look similar: 0/o, 1
    expect(id).not.toMatch(/[01]/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateShortId()));
    expect(ids.size).toBeGreaterThan(95);
  });

  it("saves and loads state", () => {
    const path = "/tmp/test-tunnel-state.json";
    const state: TunnelInfo = {
      provider: "cloudflare",
      localPort: 20128,
      publicUrl: "https://r-abc123.trycloudflare.com",
      shortId: "abc123",
      startedAt: Date.now(),
    };
    saveTunnelState(path, state);
    const loaded = loadTunnelState(path);
    expect(loaded).toEqual(state);
  });

  it("returns null for missing state file", () => {
    expect(loadTunnelState("/tmp/nonexistent-tunnel-state-xyz.json")).toBeNull();
  });

  it("clears state", () => {
    const path = `/tmp/test-tunnel-clear-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    saveTunnelState(path, { provider: "x", localPort: 1, publicUrl: "y", startedAt: 1 });
    expect(existsSync(path)).toBe(true);
    clearTunnelState(path);
    expect(existsSync(path)).toBe(false);
    expect(loadTunnelState(path)).toBeNull();
  });
});

// ============================================================
// CLOUDFLARE PROVIDER (without actual spawn)
// ============================================================
describe("CloudflareTunnelProvider", () => {
  it("exports correct download URL for current platform", () => {
    const url = getDownloadUrl();
    expect(url).toMatch(/^https:\/\/github\.com\/cloudflare\/cloudflared\/releases\/latest\/download\//);
    // Should match a known file pattern
    expect(url).toMatch(/(linux|darwin|win|amd64|arm64|386|macos)/i);
  });

  it("computes correct binary path", () => {
    const path = getBinaryPath("/tmp/test-cf");
    expect(path).toMatch(/cloudflared(\.exe)?$/);
  });

  it("detects binary not installed", () => {
    const cf = new CloudflareTunnelProvider({ dataDir: "/tmp/nonexistent-cf-test-dir" });
    expect(cf.isBinaryInstalled()).toBe(false);
  });

  it("starts in non-running state", () => {
    const cf = new CloudflareTunnelProvider({ dataDir: "/tmp/nonexistent-cf" });
    expect(cf.isRunning()).toBe(false);
    expect(cf.getPublicUrl()).toBeNull();
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================
describe("health checks", () => {
  it("probeUrlAlive returns false for invalid URL", async () => {
    expect(await probeUrlAlive("not a url")).toBe(false);
    expect(await probeUrlAlive("")).toBe(false);
  });

  it("probeUrlAlive returns false on non-200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await probeUrlAlive("https://x.com")).toBe(false);
  });

  it("probeUrlAlive returns true on 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await probeUrlAlive("https://x.com")).toBe(true);
  });

  it("waitForHealth polls until ok or timeout", async () => {
    let attempts = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) return { ok: false, status: 500 };
      return { ok: true, status: 200 };
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const ok = await waitForHealth("https://x.com", { intervalMs: 10, timeoutMs: 1000, fetchTimeoutMs: 100 });
    expect(ok).toBe(true);
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it("waitForHealth returns false on timeout", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const ok = await waitForHealth("https://x.com", { intervalMs: 10, timeoutMs: 100, fetchTimeoutMs: 50 });
    expect(ok).toBe(false);
  });

  it("waitForHealth throws on cancel", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const cancelToken = { cancelled: true };
    await expect(waitForHealth("https://x.com", { cancelToken, intervalMs: 10 })).rejects.toThrow("cancelled");
  });
});

// ============================================================
// INTERNET + DNS
// ============================================================
describe("checkInternet + resolveDns", () => {
  it("checkInternet returns true on 2xx/3xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await checkInternet()).toBe(true);
  });

  it("checkInternet returns false on 5xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await checkInternet()).toBe(false);
  });

  it("checkInternet returns false on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network down"));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await checkInternet()).toBe(false);
  });

  it("resolveDns returns true on valid DNS response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 0, Answer: [{ name: "example.com" }] }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await resolveDns("example.com")).toBe(true);
  });

  it("resolveDns returns false on NXDOMAIN", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 3 }), // NXDOMAIN
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    expect(await resolveDns("nonexistent.example")).toBe(false);
  });
});

// ============================================================
// TUNNEL MANAGER (with mock providers)
// ============================================================
describe("TunnelManager", () => {
  let manager: TunnelManager;

  beforeEach(() => {
    manager = new TunnelManager({ statePath: "/tmp/test-tunnel-manager.json" });
    // Mock internet check
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  it("registers and lists providers", () => {
    const p = makeMockProvider("cloudflare");
    manager.registerProvider("cloudflare", p);
    expect(manager.listProviders()).toContain("cloudflare");
  });

  it("throws on start with unknown provider", async () => {
    await expect(manager.start("unknown", 20128)).rejects.toThrow(/Unknown tunnel provider/);
  });

  it("starts a tunnel and stores info", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com" });
    manager.registerProvider("cloudflare", p);
    const info = await manager.start("cloudflare", 20128, { healthCheck: false });
    expect(info.publicUrl).toContain("trycloudflare.com");
    expect(info.localPort).toBe(20128);
    expect(manager.getInfo("cloudflare")).toEqual(info);
  });

  it("reuses running tunnel (no force)", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com", running: true });
    manager.registerProvider("cloudflare", p);
    const info1 = await manager.start("cloudflare", 20128, { healthCheck: false });
    const info2 = await manager.start("cloudflare", 20128, { healthCheck: false });
    expect(p.startCalls).toBe(1);
    expect(info1.publicUrl).toBe(info2.publicUrl);
  });

  it("force-replaces existing tunnel", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com", running: true });
    manager.registerProvider("cloudflare", p);
    await manager.start("cloudflare", 20128, { healthCheck: false });
    await manager.start("cloudflare", 20128, { healthCheck: false, force: true });
    expect(p.startCalls).toBe(2);
  });

  it("stops a tunnel", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com" });
    manager.registerProvider("cloudflare", p);
    await manager.start("cloudflare", 20128, { healthCheck: false });
    await manager.stop("cloudflare");
    expect(p.stopCalls).toBe(1);
    expect(manager.getInfo("cloudflare")).toBeNull();
  });

  it("stops all tunnels", async () => {
    const p1 = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com" });
    const p2 = makeMockProvider("tailscale", { publicUrl: "https://machine.ts.net" });
    manager.registerProvider("cloudflare", p1);
    manager.registerProvider("tailscale", p2);
    await manager.start("cloudflare", 20128, { healthCheck: false });
    await manager.start("tailscale", 20128, { healthCheck: false });
    await manager.stopAll();
    expect(p1.stopCalls).toBe(1);
    expect(p2.stopCalls).toBe(1);
  });

  it("refuses to start without internet", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("offline"));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const p = makeMockProvider("cloudflare");
    manager.registerProvider("cloudflare", p);
    await expect(manager.start("cloudflare", 20128, { healthCheck: false })).rejects.toThrow(/No internet/);
    expect(p.startCalls).toBe(0);
  });

  it("triggers watchdog on unexpected exit", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com" });
    manager.registerProvider("cloudflare", p);
    await manager.start("cloudflare", 20128, { healthCheck: false, respawnCooldownMs: 50 });
    // Simulate unexpected exit
    p.simulateExit();
    // Wait for watchdog to respawn
    await new Promise((r) => setTimeout(r, 5_500));
    expect(p.startCalls).toBeGreaterThanOrEqual(1);
  });

  it("respects respawn cooldown", async () => {
    const p = makeMockProvider("cloudflare", { publicUrl: "https://r-abc.trycloudflare.com" });
    manager.registerProvider("cloudflare", p);
    await manager.start("cloudflare", 20128, { healthCheck: false, respawnCooldownMs: 60_000 });
    p.simulateExit();
    p.simulateExit();
    p.simulateExit();
    await new Promise((r) => setTimeout(r, 100));
    // Should NOT have respawned (within cooldown)
    expect(p.startCalls).toBe(1);
  });
});

// === Mock provider for testing ===
function makeMockProvider(name: string, opts: { publicUrl?: string; running?: boolean } = {}): TunnelProvider & { startCalls: number; stopCalls: number; simulateExit: () => void } {
  let exitHandlers: Array<() => void> = [];
  const provider = {
    name,
    startCalls: 0,
    stopCalls: 0,
    publicUrl: opts.publicUrl ?? "https://r-mock.trycloudflare.com",
    isRunning: () => opts.running ?? false,
    getPublicUrl: () => opts.running ? (opts.publicUrl ?? "https://r-mock.trycloudflare.com") : null,
    onUnexpectedExit: (cb: () => void) => { exitHandlers.push(cb); },
    start: async (localPort: number): Promise<TunnelInfo> => {
      provider.startCalls++;
      return { provider: name, localPort, publicUrl: provider.publicUrl, startedAt: Date.now() };
    },
    stop: async () => {
      provider.stopCalls++;
    },
    simulateExit: () => { for (const h of exitHandlers) h(); },
  };
  return provider;
}
