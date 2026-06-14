/**
 * tunnel-cloudflare.ts
 *
 * Cloudflare Quick Tunnel provider. Downloads cloudflared binary,
 * spawns it as a child process, parses the public URL from stdout,
 * handles PID tracking and unexpected exit.
 *
 * Source: 9router src/lib/tunnel/cloudflare/* (cloudflared.js 449 lines,
 * manager.js 151 lines, pid.js 23 lines, healthCheck.js 29 lines)
 *
 * Usage:
 *   import { CloudflareTunnelProvider } from "./tunnel-cloudflare";
 *
 *   const cf = new CloudflareTunnelProvider({ dataDir: ".hera" });
 *   const info = await cf.start(20128);
 *   // → { publicUrl: "https://r-xyz.trycloudflare.com", ... }
 *
 *   await cf.stop();
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { platform, arch } from "os";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { TunnelProvider, TunnelInfo, StartOptions } from "./tunnel.js";
import { generateShortId } from "./tunnel.js";

const GITHUB_BASE = "https://github.com/cloudflare/cloudflared/releases/latest/download";

const PLATFORM_MAP: Record<string, Record<string, string>> = {
  darwin: {
    x64: "cloudflared-darwin-amd64.tgz",
    arm64: "cloudflared-darwin-arm64.tgz",
  },
  win32: {
    x64: "cloudflared-windows-amd64.exe",
    ia32: "cloudflared-windows-386.exe",
    arm64: "cloudflared-windows-386.exe", // fallback
  },
  linux: {
    x64: "cloudflared-linux-amd64",
    arm64: "cloudflared-linux-arm64",
  },
};

const PLATFORM_FALLBACK: Record<string, string> = {
  darwin: "cloudflared-darwin-amd64.tgz",
  win32: "cloudflared-windows-amd64.exe",
  linux: "cloudflared-linux-amd64",
};

function getBinaryName(): string {
  return platform() === "win32" ? "cloudflared.exe" : "cloudflared";
}

export function getDownloadUrl(): string {
  const p = platform();
  const a = arch();
  const map = PLATFORM_MAP[p];
  const file = map?.[a] ?? PLATFORM_FALLBACK[p];
  if (!file) throw new Error(`Unsupported platform: ${p}/${a}`);
  return `${GITHUB_BASE}/${file}`;
}

export function getBinaryPath(dataDir: string): string {
  return join(dataDir, "bin", getBinaryName());
}

export class CloudflareTunnelProvider implements TunnelProvider {
  readonly name = "cloudflare";
  private dataDir: string;
  private proc: ChildProcess | null = null;
  private currentInfo: TunnelInfo | null = null;
  private exitHandlers: Array<() => void> = [];
  private pidFile: string;

  constructor(opts: { dataDir?: string; name?: string } = {}) {
    this.dataDir = opts.dataDir ?? join(process.cwd(), ".hera");
    if (opts.name) (this as { name: string }).name = opts.name;
    this.pidFile = join(this.dataDir, "tunnel", "cloudflared.pid");
  }

  // === Check if binary exists ===
  isBinaryInstalled(): boolean {
    return existsSync(getBinaryPath(this.dataDir));
  }

  // === Download and extract/install binary ===
  async ensureBinary(): Promise<{ path: string; downloaded: boolean }> {
    const binPath = getBinaryPath(this.dataDir);
    if (existsSync(binPath)) {
      return { path: binPath, downloaded: false };
    }
    const dir = dirname(binPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const url = getDownloadUrl();
    const isArchive = url.endsWith(".tgz");
    // eslint-disable-next-line no-console
    console.log(`[cloudflared] downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);

    if (isArchive) {
      // Download to temp, extract
      const tmp = binPath + ".tgz";
      await pipeline(Readable.fromWeb(res.body as never), (await import("fs")).createWriteStream(tmp));
      const { execSync } = await import("child_process");
      const extracted = execSync(`tar -xzf "${tmp}" -C "${dir}" cloudflared`).toString();
      // eslint-disable-next-line no-console
      console.log(`[cloudflared] extracted to ${dir}`);
      try { unlinkSync(tmp); } catch { /* ignore */ }
    } else {
      await pipeline(Readable.fromWeb(res.body as never), (await import("fs")).createWriteStream(binPath));
    }

    // Make executable (unix)
    if (platform() !== "win32") {
      try { chmodSync(binPath, 0o755); } catch { /* ignore */ }
    }
    return { path: binPath, downloaded: true };
  }

  // === Spawn the tunnel ===
  async start(localPort: number, _opts: StartOptions = {}): Promise<TunnelInfo> {
    if (this.proc && this.proc.exitCode === null) {
      return this.currentInfo!;
    }
    const { path: binPath } = await this.ensureBinary();

    const args = ["tunnel", "--url", `http://localhost:${localPort}`, "--no-autoupdate", "--protocol", "http2"];
    // eslint-disable-next-line no-console
    console.log(`[cloudflared] spawning: ${binPath} ${args.join(" ")}`);
    this.proc = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    // Save PID
    this.savePid(this.proc.pid);

    // Parse stdout for URL
    const tunnelUrl = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => reject(new Error("Timeout waiting for tunnel URL")), 30_000);
      this.proc!.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        // Look for: "your quick tunnel has been created: https://..."
        const m = buffer.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      this.proc!.stderr?.on("data", (chunk: Buffer) => {
        // cloudflared logs to stderr
        const text = chunk.toString("utf8");
        buffer += text;
        const m = buffer.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
        // Forward important stderr to console
        if (text.includes("error") || text.includes("ERROR") || text.includes("WARN")) {
          // eslint-disable-next-line no-console
          console.error(`[cloudflared] ${text.trim()}`);
        }
      });
      this.proc!.on("exit", (code) => {
        clearTimeout(timer);
        this.clearPid();
        if (this.currentInfo && !this.currentInfo.publicUrl) {
          reject(new Error(`cloudflared exited (code ${code}) before URL was emitted`));
        }
        // Trigger exit handlers
        for (const h of this.exitHandlers) h();
      });
    });

    const info: TunnelInfo = {
      provider: this.name,
      localPort,
      publicUrl: tunnelUrl,
      shortId: this.extractShortId(tunnelUrl),
      startedAt: Date.now(),
      pid: this.proc.pid,
    };
    this.currentInfo = info;
    return info;
  }

  async stop(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
      // Wait briefly for graceful exit
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          this.proc?.kill("SIGKILL");
          resolve();
        }, 5_000);
        this.proc?.on("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    this.proc = null;
    this.currentInfo = null;
    this.clearPid();
  }

  isRunning(): boolean {
    return !!(this.proc && this.proc.exitCode === null);
  }

  getPublicUrl(): string | null {
    return this.currentInfo?.publicUrl ?? null;
  }

  onUnexpectedExit(cb: () => void): void {
    this.exitHandlers.push(cb);
  }

  // === PID tracking ===
  private savePid(pid: number | undefined): void {
    if (!pid) return;
    const dir = dirname(this.pidFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.pidFile, String(pid));
  }

  private clearPid(): void {
    try { unlinkSync(this.pidFile); } catch { /* ignore */ }
  }

  // === Health probe ===
  async probeHealth(timeoutMs = 5_000): Promise<boolean> {
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

  // === Extract short ID from trycloudflare URL ===
  private extractShortId(url: string): string {
    const m = url.match(/https?:\/\/([a-z0-9-]+)\.trycloudflare\.com/);
    if (!m) return generateShortId();
    return m[1];
  }
}
