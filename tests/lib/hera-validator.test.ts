/**
 * Tests for lib/hera-validator.ts
 *
 * Validates end-to-end: source files in a directory → ValidationReport.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { validateProject, getSourceFiles } from "../../lib/hera-validator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hera-validator-test-"));
});

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("getSourceFiles", () => {
  it("returns empty array for nonexistent dir", () => {
    const result = getSourceFiles("/nonexistent/path/12345");
    expect(result).toEqual([]);
  });

  it("finds .ts and .js files recursively", () => {
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "const a = 1;");
    fs.writeFileSync(path.join(tmpDir, "b.js"), "const b = 2;");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "c.ts"), "const c = 3;");

    const files = getSourceFiles(tmpDir);
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.endsWith("a.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("b.js"))).toBe(true);
    expect(files.some((f) => f.endsWith("c.ts"))).toBe(true);
  });

  it("skips excluded directories", () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "node_modules", "skip.ts"), "should skip");
    fs.writeFileSync(path.join(tmpDir, "keep.ts"), "const x = 1;");

    const files = getSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("keep.ts");
  });

  it("skips non-source files", () => {
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "ok");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "skip");
    fs.writeFileSync(path.join(tmpDir, "c.md"), "skip");

    const files = getSourceFiles(tmpDir);
    expect(files).toHaveLength(1);
  });
});

describe("validateProject", () => {
  it("returns a non-zero score for empty project (some checks pass by default)", () => {
    const report = validateProject(tmpDir);
    expect(report.maxScore).toBeGreaterThan(0);
    // Several checks (e.g. "API keys not logged") return true when the feature
    // is absent — so an empty project gets a small baseline score, not 0%.
    expect(report.score).toBeGreaterThan(0);
    expect(report.percentage).toBeLessThan(50);
  });

  it("returns 100% for ideal project", () => {
    // Build a "perfect" codebase that satisfies all checks
    const code = `
      class AgentHarness {
        run() {
          while (true) {
            // outer loop
            // inner loop
            this.emit('event', {});
            const ctx = structuredClone(this.context);
            if (this.signal.aborted) break;
          }
        }
      }
      class Agent {}
      interface AgentMessage {}
      declare module 'x' { interface CustomAgentMessages {} }
      function convertToLlm(m) { try { return m; } catch { return null; } }
      function bashExecution() {}
      const tool = { name: 'x', description: 'x', execute: () => {} };
      const schema = Type.Object({});
      await Promise.all([]);
      for (const x of []) {}
      class Session { parentId = 'p'; }
      session.fork();
      function buildContext() {}
      tool.isError = true;
      async function retry() { attempt++; }
      try {} catch { return fallback; }
      const cwd = '/tmp';
      function validate() {}
      const apiKey = 'sk-123';
      // streaming
      async function* call(ctx) { for await (const c of stream) yield c; }
      signal.addEventListener('abort', () => {});
      const total = response.usage.input_tokens;
      // quality
      it('works', () => {});
      on: [push]
      runs-on: ubuntu-latest
      try { return primary; } catch { return fallback; }
      if (cost > budget) return error;
      logger.info('event');
    `;
    fs.writeFileSync(path.join(tmpDir, "perfect.ts"), code);

    const report = validateProject(tmpDir);
    expect(report.percentage).toBe(100);
    expect(report.issues).toHaveLength(0);
  });

  it("categorizes checks into 8 categories", () => {
    const report = validateProject(tmpDir);
    expect(report.categories).toHaveLength(8);
    const names = report.categories.map((c) => c.category);
    expect(names).toContain("coreArchitecture");
    expect(names).toContain("messageSystem");
    expect(names).toContain("toolSystem");
    expect(names).toContain("sessionSystem");
    expect(names).toContain("errorHandling");
    expect(names).toContain("security");
    expect(names).toContain("streaming");
    expect(names).toContain("quality");
  });

  it("flags issues for missing patterns", () => {
    fs.writeFileSync(path.join(tmpDir, "minimal.ts"), "const x = 1;");
    const report = validateProject(tmpDir);
    expect(report.issues.length).toBeGreaterThan(0);
    const allIssueNames = report.issues.map((i) => i.name);
    expect(allIssueNames.some((n) => n.includes("Agent"))).toBe(true);
  });

  it("score is consistent with passed + failed", () => {
    fs.writeFileSync(path.join(tmpDir, "code.ts"), "class Agent {}");
    const report = validateProject(tmpDir);
    const total = report.categories.reduce((s, c) => s + c.total, 0);
    const passed = report.categories.reduce((s, c) => s + c.passed, 0);
    expect(total).toBe(report.maxScore);
    expect(passed).toBe(report.score);
  });
});
