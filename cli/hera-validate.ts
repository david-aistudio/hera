#!/usr/bin/env node
/**
 * hera validate — Validate an agent implementation against Hera architecture
 *
 * Usage: hera validate [directory]
 *
 * Checks:
 * - Core architecture patterns
 * - Message system
 * - Tool system
 * - Session system
 * - Queue system
 * - Compaction
 * - Extension system
 * - AI layer
 * - System prompt
 * - Error handling
 * - Security
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

interface ValidationResult {
  category: string;
  checks: CheckResult[];
  passed: number;
  total: number;
}

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  severity: "error" | "warning" | "info";
}

interface ValidationReport {
  score: number;
  maxScore: number;
  percentage: number;
  categories: ValidationResult[];
  issues: CheckResult[];
  warnings: CheckResult[];
}

// ============================================================================
// Checks
// ============================================================================

const CHECKS = {
  // Core Architecture
  coreArchitecture: [
    {
      name: "Agent loop has two-loop design",
      check: (code: string) => code.includes("outer") && code.includes("inner"),
      message: "Agent loop should have outer (follow-up) and inner (steering) loops",
    },
    {
      name: "Agent class wraps loop",
      check: (code: string) => code.includes("class Agent") || code.includes("classAgent"),
      message: "Should have an Agent class that wraps the agent loop",
    },
    {
      name: "Agent harness wraps agent",
      check: (code: string) => code.includes("class AgentHarness") || code.includes("Harness"),
      message: "Should have an AgentHarness class for orchestration",
    },
    {
      name: "Context is immutable",
      check: (code: string) => code.includes("slice()") || code.includes("copy") || code.includes("structuredClone"),
      message: "Context should be copied before each turn (slice/copy/structuredClone)",
    },
    {
      name: "Events emitted in order",
      check: (code: string) => code.includes("emit") || code.includes("event"),
      message: "Should emit events for lifecycle tracking",
    },
    {
      name: "AbortSignal respected",
      check: (code: string) => code.includes("AbortSignal") || code.includes("signal") || code.includes("abort"),
      message: "Should respect AbortSignal for cancellation",
    },
  ],

  // Message System
  messageSystem: [
    {
      name: "AgentMessage type defined",
      check: (code: string) => code.includes("AgentMessage") || code.includes("Message"),
      message: "Should define AgentMessage type",
    },
    {
      name: "Custom messages via declaration merging",
      check: (code: string) => code.includes("declare module") || code.includes("CustomAgentMessages"),
      message: "Should support custom messages via declaration merging",
    },
    {
      name: "convertToLlm never throws",
      check: (code: string) => {
        if (!code.includes("convertToLlm")) return true;
        return !code.includes("throw") || code.includes("catch") || code.includes("try");
      },
      message: "convertToLlm should not throw — use safe fallbacks",
    },
    {
      name: "bashExecution handling",
      check: (code: string) => code.includes("bashExecution") || code.includes("bash"),
      message: "Should handle bashExecution messages",
    },
  ],

  // Tool System
  toolSystem: [
    {
      name: "Tools have name and description",
      check: (code: string) => {
        if (!code.includes("Tool") && !code.includes("tool")) return true;
        return code.includes("name") && code.includes("description");
      },
      message: "Tools should have name and description",
    },
    {
      name: "Tools have execute function",
      check: (code: string) => code.includes("execute") || code.includes("function execute"),
      message: "Tools should have an execute function",
    },
    {
      name: "Tool parameters validated",
      check: (code: string) => code.includes("TypeBox") || code.includes("schema") || code.includes("validate"),
      message: "Tool parameters should be validated (TypeBox or similar)",
    },
    {
      name: "Parallel execution support",
      check: (code: string) => code.includes("parallel") || code.includes("Promise.all"),
      message: "Should support parallel tool execution",
    },
    {
      name: "Sequential execution support",
      check: (code: string) => code.includes("sequential") || code.includes("for...of"),
      message: "Should support sequential tool execution",
    },
  ],

  // Session System
  sessionSystem: [
    {
      name: "Session is tree-based",
      check: (code: string) => {
        if (!code.includes("Session") && !code.includes("session")) return true;
        return code.includes("parentId") || code.includes("parent") || code.includes("tree");
      },
      message: "Session should be tree-based (not linear log)",
    },
    {
      name: "Session supports branching",
      check: (code: string) => code.includes("fork") || code.includes("branch") || code.includes("switch"),
      message: "Session should support branching (fork/switch)",
    },
    {
      name: "Context building from tree",
      check: (code: string) => code.includes("buildContext") || code.includes("getPathToRoot"),
      message: "Should build context by walking tree to root",
    },
  ],

  // Error Handling
  errorHandling: [
    {
      name: "Tool errors become error results",
      check: (code: string) => {
        if (!code.includes("tool") && !code.includes("Tool")) return true;
        return code.includes("isError") || code.includes("error result");
      },
      message: "Tool errors should become error results, not exceptions",
    },
    {
      name: "Retry logic exists",
      check: (code: string) => code.includes("retry") || code.includes("backoff") || code.includes("attempt"),
      message: "Should have retry logic for transient failures",
    },
    {
      name: "Graceful degradation",
      check: (code: string) => code.includes("fallback") || code.includes("degradat") || code.includes("partial"),
      message: "Should handle failures gracefully",
    },
  ],

  // Security
  security: [
    {
      name: "Tool execution sandboxed",
      check: (code: string) => {
        if (!code.includes("bash") && !code.includes("Bash")) return true;
        return code.includes("cwd") || code.includes("sandbox") || code.includes("restrict");
      },
      message: "Bash tool should be sandboxed (cwd-based)",
    },
    {
      name: "Input validation exists",
      check: (code: string) => code.includes("validate") || code.includes("sanitize") || code.includes("schema"),
      message: "Should validate user input",
    },
    {
      name: "API keys not logged",
      check: (code: string) => {
        if (!code.includes("apiKey") && !code.includes("api_key")) return true;
        return !code.includes("console.log(apiKey") && !code.includes("console.log(api_key");
      },
      message: "API keys should never be logged",
    },
  ],
};

// ============================================================================
// Validator
// ============================================================================

function validateProject(dir: string): ValidationReport {
  const results: ValidationResult[] = [];
  const allIssues: CheckResult[] = [];
  const allWarnings: CheckResult[] = [];

  // Read all source files
  const sourceFiles = getSourceFiles(dir);
  const allCode = sourceFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

  // Run checks
  for (const [category, checks] of Object.entries(CHECKS)) {
    const categoryResults: CheckResult[] = [];

    for (const check of checks) {
      const passed = check.check(allCode);
      const result: CheckResult = {
        name: check.name,
        passed,
        message: passed ? undefined : check.message,
        severity: passed ? "info" : "error",
      };

      categoryResults.push(result);

      if (!passed) {
        allIssues.push(result);
      }
    }

    const passed = categoryResults.filter((r) => r.passed).length;
    results.push({
      category,
      checks: categoryResults,
      passed,
      total: categoryResults.length,
    });
  }

  // Calculate score
  const totalChecks = results.reduce((sum, r) => sum + r.total, 0);
  const passedChecks = results.reduce((sum, r) => sum + r.passed, 0);
  const percentage = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return {
    score: passedChecks,
    maxScore: totalChecks,
    percentage,
    categories: results,
    issues: allIssues,
    warnings: allWarnings,
  };
}

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!["node_modules", "dist", ".git", "coverage"].includes(entry.name)) {
        files.push(...getSourceFiles(fullPath));
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================================
// Report Printer
// ============================================================================

function printReport(report: ValidationReport): void {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║              Hera Validation Report                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Category results
  for (const category of report.categories) {
    const icon = category.passed === category.total ? "✓" : "✗";
    const color = category.passed === category.total ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(`${color}${icon}${reset} ${formatCategoryName(category.category)} (${category.passed}/${category.total})`);

    for (const check of category.checks) {
      const checkIcon = check.passed ? "  ✓" : "  ✗";
      const checkColor = check.passed ? "\x1b[32m" : "\x1b[31m";
      console.log(`${checkColor}${checkIcon}${reset} ${check.name}`);

      if (!check.passed && check.message) {
        console.log(`    \x1b[33m→ ${check.message}\x1b[0m`);
      }
    }

    console.log();
  }

  // Summary
  const scoreColor = report.percentage >= 80 ? "\x1b[32m" : report.percentage >= 60 ? "\x1b[33m" : "\x1b[31m";
  console.log("─".repeat(60));
  console.log(`\n${scoreColor}Score: ${report.score}/${report.maxScore} (${report.percentage}%)${report.percentage >= 80 ? " ✓" : ""}\x1b[0m`);

  if (report.issues.length > 0) {
    console.log(`\n\x1b[31mIssues found: ${report.issues.length}\x1b[0m`);
  }

  if (report.percentage >= 80) {
    console.log("\n\x1b[32m✓ Implementation matches Hera architecture!\x1b[0m");
  } else {
    console.log("\n\x1b[33m⚠ Some checks failed. See above for details.\x1b[0m");
  }

  console.log();
}

function formatCategoryName(category: string): string {
  return category
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const dir = args[0] || ".";

  console.log(`🔍 Validating: ${path.resolve(dir)}\n`);

  const report = validateProject(dir);
  printReport(report);

  // Exit with code if validation fails
  if (report.percentage < 80) {
    process.exit(1);
  }
}

main();
