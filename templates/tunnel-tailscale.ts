/**
 * tunnel-tailscale.ts
 *
 * Tailscale Funnel provider. Manages tailscale daemon, login, and starts
 * Funnel to expose a local port as a public HTTPS URL on *.ts.net.
 *
 * Source: 9router src/lib/tunnel/tailscale/* (tailscale.js 859 lines,
 * manager.js 129 lines, healthCheck.js 29 lines)
 *
 * Requires `tailscale` binary installed on the system.
 *
 * Usage:
 *   import { TailscaleFunnelProvider } from "./tunnel-tailscale";
 *
 *   const ts = new TailscaleFunnelProvider();
 *   if (!(await ts.isInstalled())) {
 *     console.log("Install: brew install tailscale / apt install tailscale");
 *   }
 *   const info = await ts.start(20128);
 *   // → { publicUrl: "https://machine-name.tail-abc.ts.net", ... }
 *
 *   await ts.stop();
 */

import { spawn, exec, type ChildProcess } from "child_process";
import { promisify } from "util";
import type { TunnelProvider, TunnelInfo, StartOptions } from "./tunnel.js";

const execAsync = promisify(exec);

const TAILSCALE_SOCKET = "/var/run/tailscale/tailscaled.sock";

export class TailscaleFunnelProvider implements TunnelProvider {
  readonly name = "tailscale";
  private proc: ChildProcess | null = null;
  private currentInfo: TunnelInfo | null = null;
  private exitHandlers: Array<() => void> = [];

  constructor(_opts: { name?: string } = {}) {
    if (_opts.name) (this as { name: string }).name = _opts.name;
  }

  // === Get tailscale binary path ===
  async getTailscaleBin(): Promise<string> {
    // Common locations
    const candidates = ["/usr/bin/tailscale", "/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "/usr/sbin/tailscale"];
    for (const c of candidates) {
      try {
        await execAsync(`test -x "${c}"`);
        return c;
      } catch { /* try next */ }
    }
    // Fall back to PATH
    const { stdout } = await execAsync("which tailscale");
    return stdout.trim() || "tailscale";
  }

  // === Check if installed ===
  async isInstalled(): Promise<boolean> {
    try {
      await execAsync("tailscale version", { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  // === Check if logged in ===
  async isLoggedIn(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("tailscale status --json", { timeout: 5_000 });
      const status = JSON.parse(stdout);
      return !!status.BackendState && status.BackendState === "Running";
    } catch {
      return false;
    }
  }

  // === Start tailscaled daemon if not running ===
  async ensureDaemon(): Promise<void> {
    try {
      const { stdout } = await execAsync("tailscale status --json", { timeout: 3_000 });
      const status = JSON.parse(stdout);
      if (status.BackendState === "Running") return;
    } catch {
      // Daemon not running
    }
    // Try to start
    try {
      // eslint-disable-next-line no-console
      console.log("[tailscale] starting daemon...");
      await execAsync("tailscaled --state=/var/lib/tailscale/tailscaled.state &", { timeout: 3_000 });
    } catch {
      // May need sudo
      try {
        await execAsync("sudo tailscaled --state=/var/lib/tailscale/tailscaled.state &", { timeout: 5_000 });
      } catch (err) {
        throw new Error(`Failed to start tailscaled: ${(err as Error).message}`);
      }
    }
    // Wait for daemon
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        const { stdout } = await execAsync("tailscale status --json", { timeout: 3_000 });
        if (JSON.parse(stdout).BackendState === "Running") return;
      } catch { /* not ready */ }
    }
    throw new Error("Tailscale daemon did not start in time");
  }

  // === Get current tailscale hostname ===
  async getHostname(): Promise<string> {
    const { stdout } = await execAsync("tailscale status --json", { timeout: 5_000 });
    const status = JSON.parse(stdout);
    // Prefer FullyQualifiedDomainName (e.g. "machine.tail-abc.ts.net")
    return status.Self?.DNSName?.replace(/\.$/, "") ?? status.Self?.HostName ?? "unknown";
  }

  // === Start Funnel ===
  async start(localPort: number, _opts: StartOptions = {}): Promise<TunnelInfo> {
    if (!(await this.isInstalled())) {
      throw new Error("Tailscale not installed. Install from https://tailscale.com/download");
    }
    if (!(await this.isLoggedIn())) {
      throw new Error("Tailscale not logged in. Run: tailscale login");
    }
    await this.ensureDaemon();

    const hostname = await this.getHostname();
    // Enable funnel for this node
    // eslint-disable-next-line no-console
    console.log(`[tailscale] enabling Funnel for ${hostname}:${localPort}`);
    const { stdout, stderr } = await execAsync(`tailscale funnel --bg ${localPort} on`, { timeout: 30_000 });
    if (stderr && !stdout) {
      // eslint-disable-next-line no-console
      console.warn(`[tailscale] stderr: ${stderr}`);
    }

    const publicUrl = `https://${hostname}`;

    // Track the funnel process (bg)
    this.proc = spawn("tailscale", ["funnel", "serve", "--bg", String(localPort)], {
      stdio: "ignore",
      detached: false,
    });
    this.proc.on("exit", () => {
      for (const h of this.exitHandlers) h();
    });

    const info: TunnelInfo = {
      provider: this.name,
      localPort,
      publicUrl,
      startedAt: Date.now(),
    };
    this.currentInfo = info;
    return info;
  }

  // === Stop Funnel ===
  async stop(): Promise<void> {
    try {
      // eslint-disable-next-line no-console
      console.log("[tailscale] disabling Funnel");
      await execAsync("tailscale funnel --bg off", { timeout: 10_000 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[tailscale] failed to disable funnel: ${(err as Error).message}`);
    }
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
    }
    this.proc = null;
    this.currentInfo = null;
  }

  isRunning(): boolean {
    return !!this.currentInfo;
  }

  getPublicUrl(): string | null {
    return this.currentInfo?.publicUrl ?? null;
  }

  onUnexpectedExit(cb: () => void): void {
    this.exitHandlers.push(cb);
  }

  // === Health probe (Tailscale cert provisioning can be slow) ===
  async probeHealth(timeoutMs = 8_000): Promise<boolean> {
    if (!this.currentInfo) return false;
    try {
      const res = await fetch(`${this.currentInfo.publicUrl}/api/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export { TAILSCALE_SOCKET };
