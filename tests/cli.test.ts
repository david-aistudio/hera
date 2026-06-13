/**
 * CLI integration tests
 *
 * Spawns the actual CLI binaries (bin/hera.js, cli/hera-validate.ts,
 * cli/hera-graph.ts) and verifies their behavior.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const HERA_BIN = path.join(ROOT, "bin", "hera.js");
const HERA_GRAPH_TS = path.join(ROOT, "cli", "hera-graph.ts");
const HERA_VALIDATE_TS = path.join(ROOT, "cli", "hera-validate.ts");

function runTsx(script: string, args: string[] = []): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", "--no-warnings", script, ...args], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30000,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || err.message || "",
      status: err.status || 1,
    };
  }
}

describe("bin/hera.js", () => {
  it("--help prints usage and exits 0", () => {
    const r = runTsx(HERA_BIN, ["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Hera");
    expect(r.stdout).toContain("Supported agents");
    expect(r.stdout).toContain("claude");
    expect(r.stdout).toContain("hermes");
  });

  it("-h is alias for --help", () => {
    const r = runTsx(HERA_BIN, ["-h"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Hera");
  });

  it("graph subcommand is recognized (delegates to hera-graph)", () => {
    // The dispatcher uses stdio:'inherit' so the child writes directly to
    // the terminal. We verify delegation by checking that the parent does
    // NOT print its own help text (banner should still appear).
    const r = runTsx(HERA_BIN, ["graph", "--help"]);
    // Banner should appear (parent code ran), but install help should NOT
    expect(r.stdout).toContain("Hera Installer");
    expect(r.stdout).not.toContain("Supported agents:");
  });

  it("lists all 18 supported agents in help", () => {
    const r = runTsx(HERA_BIN, ["--help"]);
    const expectedAgents = [
      "claude",
      "hermes",
      "cursor",
      "opencode",
      "codex",
      "kilo",
      "kiro",
      "aider",
      "gemini",
      "pi",
      "copilot",
      "devin",
      "antigravity",
      "codebuddy",
      "amp",
      "trae",
      "claw",
      "droid",
    ];
    for (const a of expectedAgents) {
      expect(r.stdout, `help should mention ${a}`).toContain(a);
    }
  });
});

describe("cli/hera-graph.ts", () => {
  it("--help prints usage and exits 0", () => {
    const r = runTsx(HERA_GRAPH_TS, ["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Hera Graph");
    expect(r.stdout).toContain("Usage:");
  });

  it("-h is alias for --help", () => {
    const r = runTsx(HERA_GRAPH_TS, ["-h"]);
    expect(r.status).toBe(0);
  });

  it("default (no args) prints help", () => {
    const r = runTsx(HERA_GRAPH_TS, []);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Hera Graph");
  });

  it("unknown command prints error and help", () => {
    const r = runTsx(HERA_GRAPH_TS, ["nonsense-cmd"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Unknown command");
  });

  it("query without term shows usage", () => {
    const r = runTsx(HERA_GRAPH_TS, ["query"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Usage");
  });

  it("path with missing args shows usage", () => {
    const r = runTsx(HERA_GRAPH_TS, ["path"]);
    expect(r.status).toBe(1);
  });

  it("explain without node shows usage", () => {
    const r = runTsx(HERA_GRAPH_TS, ["explain"]);
    expect(r.status).toBe(1);
  });
});

describe("cli/hera-validate.ts", () => {
  it("runs against a real project and produces a report", () => {
    const r = runTsx(HERA_VALIDATE_TS, ["examples/full-agent/src"]);
    // full-agent likely fails the threshold so non-zero exit is fine
    expect(r.stdout).toContain("Hera Validation Report");
    expect(r.stdout).toContain("Score:");
    expect(r.stdout).toMatch(/Score: \d+\/\d+/);
  });

  it("default (no args) validates current dir", () => {
    const r = runTsx(HERA_VALIDATE_TS, []);
    expect(r.stdout).toContain("Hera Validation Report");
  });

  it("handles nonexistent directory gracefully", () => {
    const r = runTsx(HERA_VALIDATE_TS, ["/nonexistent/path/abc123"]);
    // Should not crash; either empty results or error
    expect(r.stdout).toContain("Hera Validation Report");
  });
});
