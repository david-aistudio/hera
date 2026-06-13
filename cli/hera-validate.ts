#!/usr/bin/env node
/**
 * hera validate — Validate an agent implementation against Hera architecture
 *
 * Usage: hera validate [directory]
 *
 * Validation logic lives in lib/hera-validator.ts (testable, pure).
 * This file is the thin CLI wrapper: parse args, run, print report.
 */

import * as path from "path";
import { validateProject, ValidationReport, CategoryResult } from "../lib/hera-validator.js";

// ============================================================================
// Report Printer
// ============================================================================

function formatCategoryName(category: string): string {
  return category
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function printReport(report: ValidationReport): void {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║              Hera Validation Report                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  for (const category of report.categories) {
    printCategory(category);
    console.log();
  }

  printSummary(report);
  console.log();
}

function printCategory(category: CategoryResult): void {
  const icon = category.passed === category.total ? "✓" : "✗";
  const color = category.passed === category.total ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";

  console.log(
    `${color}${icon}${reset} ${formatCategoryName(category.category)} (${category.passed}/${category.total})`
  );

  for (const check of category.checks) {
    const checkIcon = check.passed ? "  ✓" : "  ✗";
    const checkColor = check.passed ? "\x1b[32m" : "\x1b[31m";
    console.log(`${checkColor}${checkIcon}${reset} ${check.name}`);

    if (!check.passed && check.message) {
      console.log(`    \x1b[33m→ ${check.message}\x1b[0m`);
    }
  }
}

function printSummary(report: ValidationReport): void {
  const scoreColor =
    report.percentage >= 80 ? "\x1b[32m" : report.percentage >= 60 ? "\x1b[33m" : "\x1b[31m";
  console.log("─".repeat(60));
  console.log(
    `\n${scoreColor}Score: ${report.score}/${report.maxScore} (${report.percentage}%)${
      report.percentage >= 80 ? " ✓" : ""
    }\x1b[0m`
  );

  if (report.issues.length > 0) {
    console.log(`\n\x1b[31mIssues found: ${report.issues.length}\x1b[0m`);
  }

  if (report.percentage >= 80) {
    console.log("\n\x1b[32m✓ Implementation matches Hera architecture!\x1b[0m");
  } else {
    console.log("\n\x1b[33m⚠ Some checks failed. See above for details.\x1b[0m");
  }
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const dir = args[0] || ".";

  console.log(`🔍 Validating: ${path.resolve(dir)}\n`);

  const report = validateProject(dir);
  printReport(report);

  if (report.percentage < 80) {
    process.exit(1);
  }
}

main();
