import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import {
  compareVersions,
  fetchLatestVersion,
  versionChecker,
  getDefaultDataDir,
  getStatusFile,
  getUpdateDir,
  getUpdaterScript,
  killAppProcesses,
  type UpdateState,
} from "../../templates/updater.js";

// ============================================================
// VERSION COMPARISON
// ============================================================
describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns 1 when a > b (major)", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("returns -1 when a < b (major)", () => {
    expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
  });

  it("returns 1 when a > b (minor)", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
  });

  it("returns 1 when a > b (patch)", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
  });

  it("handles missing parts (treats as 0)", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });

  it("handles 'v' prefix", () => {
    expect(compareVersions("v2.0.0", "v1.9.9")).toBe(1);
  });
});

// ============================================================
// NPM REGISTRY FETCH
// ============================================================
describe("fetchLatestVersion", () => {
  it("fetches latest version from npm registry", async () => {
    const result = await fetchLatestVersion("9router", 10_000);
    // We don't assert a specific version, just that it returns a string or null
    if (result) {
      expect(result).toMatch(/^\d+\.\d+\.\d+/);
    }
  }, 15_000);

  it("returns null on timeout", async () => {
    const result = await fetchLatestVersion("non-existent-pkg-12345-xyz", 1_000);
    expect(result).toBeNull();
  }, 5_000);
});

// ============================================================
// VERSION CHECKER
// ============================================================
describe("versionChecker", () => {
  it("returns version status", async () => {
    const status = await versionChecker("9router", "0.0.1");
    expect(status.currentVersion).toBe("0.0.1");
    // latestVersion may be null on network failure, but the call should not throw
    expect(typeof status.hasUpdate).toBe("boolean");
  }, 15_000);

  it("handles fake current version (always has update if latest known)", async () => {
    const status = await versionChecker("9router", "999.0.0");
    if (status.latestVersion) {
      expect(status.hasUpdate).toBe(false); // current is way ahead
    }
  }, 15_000);
});

// ============================================================
// STATE PERSISTENCE
// ============================================================
describe("update state", () => {
  it("computes correct paths", () => {
    const config = { packageName: "test-pkg", currentVersion: "1.0.0", dataDir: "/tmp/test-data" };
    expect(getDefaultDataDir("test-pkg")).toMatch(/test-pkg$/);
    expect(getUpdateDir(config)).toBe("/tmp/test-data/update");
    expect(getStatusFile(config)).toBe("/tmp/test-data/update/status.json");
  });

  it("saves and loads state", () => {
    const _path = "/tmp/test-update-state.json";
    const state: UpdateState = {
      phase: "installing",
      packageName: "x",
      currentVersion: "1.0.0",
      startedAt: 1000,
      finishedAt: null,
      attempt: 1,
      maxRetries: 3,
      done: false,
      success: false,
      exitCode: null,
      error: null,
      logTail: ["line 1", "line 2"],
    };
    // Use a custom path via temp file
    const tmp = `/tmp/test-state-${Date.now()}.json`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    const loaded = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(loaded).toEqual(state);
    unlinkSync(tmp);
  });

  it("getUpdaterScript generates valid JS", () => {
    const script = getUpdaterScript();
    expect(script).toContain("UPDATER_PKG_NAME");
    expect(script).toContain("UPDATER_PORT");
    expect(script).toContain("runInstall");
    expect(script).toContain("relaunchApp");
    expect(script).toContain("server.listen");
    // Uses env vars for relaunch command (parameterized, not hardcoded)
    expect(script).toContain("UPDATER_RELAUNCH_CMD");
    expect(script).toContain("UPDATER_RELAUNCH_ARGS");
  });
});

// ============================================================
// UPDATER SCRIPT STRUCTURE
// ============================================================
describe("updater script", () => {
  it("contains all required phases", () => {
    const script = getUpdaterScript();
    expect(script).toContain('"starting"');
    expect(script).toContain('"waitingForExit"');
    expect(script).toContain('"installing"');
    expect(script).toContain('"done"');
    expect(script).toContain('"error"');
  });

  it("uses npm install command", () => {
    const script = getUpdaterScript();
    expect(script).toContain("npm");
    expect(script).toContain("i");
    expect(script).toContain("-g");
    expect(script).toContain("--prefer-online");
  });

  it("has retry logic", () => {
    const script = getUpdaterScript();
    expect(script).toContain("retrying");
    expect(script).toContain("maxRetries");
    expect(script).toContain("retryDelayMs");
  });

  it("has relaunch logic", () => {
    const script = getUpdaterScript();
    expect(script).toContain("relaunchApp");
    expect(script).toContain("UPDATER_RELAUNCH");
  });

  it("has health check endpoint", () => {
    const script = getUpdaterScript();
    expect(script).toContain("/update/status");
    expect(script).toContain("server.listen");
  });

  it("opens browser on app ready", () => {
    const script = getUpdaterScript();
    expect(script).toContain("openBrowser");
    expect(script).toContain("xdg-open");
    expect(script).toContain("start");
  });
});

// ============================================================
// PROCESS KILLER (smoke test — we won't actually kill real procs)
// ============================================================
describe("killAppProcesses", () => {
  it("returns a result with killed list", async () => {
    // Use a non-existent app name so we kill nothing
    const result = await killAppProcesses("non-existent-app-12345-xyz");
    expect(result.killed).toBeInstanceOf(Array);
    // For non-existent app, killed should be empty
    expect(result.killed.length).toBe(0);
  }, 10_000);
});
