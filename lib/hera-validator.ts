/**
 * Hera Validator
 *
 * Walks a project directory, reads all source files, and runs the
 * architectural CHECKS against the concatenated code. Produces a
 * ValidationReport with score, per-category results, and issues.
 */

import * as fs from "fs";
import * as path from "path";
import { CHECKS, Check, CheckCategory } from "./hera-checks.js";

export interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  hint?: string;
  severity: "error" | "warning" | "info";
}

export interface CategoryResult {
  category: string;
  checks: CheckResult[];
  passed: number;
  total: number;
}

export interface ValidationReport {
  score: number;
  maxScore: number;
  percentage: number;
  categories: CategoryResult[];
  issues: CheckResult[];
  warnings: CheckResult[];
}

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".graphify", "examples"]);

export function getSourceFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...getSourceFiles(fullPath));
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

export function runCheck(check: Check, code: string): CheckResult {
  const passed = check.check(code);
  return {
    name: check.name,
    passed,
    message: passed ? undefined : check.message,
    hint: passed ? undefined : check.hint,
    severity: passed ? "info" : "error",
  };
}

export function validateProject(dir: string): ValidationReport {
  const sourceFiles = getSourceFiles(dir);
  const allCode = sourceFiles.map((f) => fs.readFileSync(f, "utf-8")).join("\n");

  const categories: CategoryResult[] = [];
  const allIssues: CheckResult[] = [];

  for (const [category, checks] of Object.entries(CHECKS) as [CheckCategory, Check[]][]) {
    const results = checks.map((check) => runCheck(check, allCode));
    const passed = results.filter((r) => r.passed).length;
    categories.push({
      category,
      checks: results,
      passed,
      total: results.length,
    });
    for (const r of results) {
      if (!r.passed) allIssues.push(r);
    }
  }

  const totalChecks = categories.reduce((sum, c) => sum + c.total, 0);
  const passedChecks = categories.reduce((sum, c) => sum + c.passed, 0);
  const percentage =
    totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return {
    score: passedChecks,
    maxScore: totalChecks,
    percentage,
    categories,
    issues: allIssues,
    warnings: [],
  };
}
