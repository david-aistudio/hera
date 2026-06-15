#!/usr/bin/env node
/**
 * Hera CLI — Command-line interface for the Hera Framework
 *
 * Usage:
 *   hera init [project-name]    — Scaffold a new agent project
 *   hera validate [directory]   — Validate an agent implementation
 *   hera install [agent]        — Install Hera skill for an AI agent
 *   hera uninstall [agent]      — Uninstall Hera skill from an AI agent
 *   hera --help                 — Show help
 *   hera --version              — Show version
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ============================================================================
// Version — read dynamically from package.json to avoid version drift
// ============================================================================

let VERSION = "2.10.0";
try {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  VERSION = pkg.version || VERSION;
} catch {
  // Fallback to hardcoded version
}

// ============================================================================
// Commands
// ============================================================================

const COMMANDS: Record<string, { description: string; handler: () => void }> = {
  init: {
    description: "Scaffold a new AI coding agent project",
    handler: () => {
      // Delegate to hera-init.ts via tsx
      const scriptPath = path.join(__dirname, "hera-init.ts");
      execSync(`npx tsx "${scriptPath}" ${process.argv.slice(3).join(" ")}`, {
        stdio: "inherit",
      });
    },
  },
  validate: {
    description: "Validate an agent implementation against Hera architecture",
    handler: () => {
      // Delegate to hera-validate.ts via tsx
      const scriptPath = path.join(__dirname, "hera-validate.ts");
      execSync(`npx tsx "${scriptPath}" ${process.argv.slice(3).join(" ")}`, {
        stdio: "inherit",
      });
    },
  },
  install: {
    description: "Install Hera skill for an AI coding agent (e.g., claude, cursor, opencode)",
    handler: () => {
      // Delegate to bin/hera.cjs with the remaining args
      const binPath = path.join(__dirname, "..", "bin", "hera.cjs");
      const installArgs = process.argv.slice(3).join(" ");
      execSync(`node "${binPath}" ${installArgs}`, {
        stdio: "inherit",
      });
    },
  },
  uninstall: {
    description: "Uninstall Hera skill from an AI coding agent",
    handler: () => {
      // Delegate to bin/hera.cjs uninstall with the remaining args
      const binPath = path.join(__dirname, "..", "bin", "hera.cjs");
      const agentArg = process.argv.slice(3).join(" ");
      execSync(`node "${binPath}" uninstall ${agentArg}`, {
        stdio: "inherit",
      });
    },
  },
};

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`
Hera CLI v${VERSION} — AI Coding Agent Framework

Usage:
  hera <command> [options]

Commands:
  init [project-name]    Scaffold a new agent project
  validate [directory]   Validate an agent implementation
  install [agent]        Install Hera skill for an AI agent
  uninstall [agent]      Uninstall Hera skill from an AI agent

Options:
  --help                 Show this help message
  --version              Show version

Install Examples:
  hera install claude            Install for Claude Code
  hera install cursor            Install for Cursor
  hera install opencode          Install for OpenCode
  hera install all               Install for all agents
  hera install                   Auto-detect and install (with confirmation)
  hera install claude --yes      Install without confirmation (CI/CD)

Uninstall Examples:
  hera uninstall claude          Uninstall from Claude Code
  hera uninstall cursor          Uninstall from Cursor

Flags (install only):
  --yes, -y              Skip confirmation prompt (CI/CD friendly)
  --version-tag <tag>    Install from specific git tag/branch (default: main)

Other Examples:
  hera init my-agent
  hera validate ./src
  hera validate .

For more information, see https://github.com/ahmdd4vd/hera
`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  // Handle flags
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`hera v${VERSION}`);
    return;
  }

  // Handle commands
  const command = args[0];

  if (!command) {
    showHelp();
    return;
  }

  if (COMMANDS[command]) {
    COMMANDS[command].handler();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error(`Run "hera --help" for available commands`);
    process.exit(1);
  }
}

main();
