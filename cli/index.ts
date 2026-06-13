#!/usr/bin/env node
/**
 * Hera CLI — Command-line interface for the Hera Framework
 *
 * Usage:
 *   hera init [project-name]    — Scaffold a new agent project
 *   hera validate [directory]   — Validate an agent implementation
 *   hera --help                 — Show help
 *   hera --version              — Show version
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Version
// ============================================================================

const VERSION = "1.0.0";

// ============================================================================
// Commands
// ============================================================================

const COMMANDS: Record<string, { description: string; handler: () => void }> = {
  init: {
    description: "Scaffold a new AI coding agent project",
    handler: () => {
      require("./hera-init.ts");
    },
  },
  validate: {
    description: "Validate an agent implementation against Hera architecture",
    handler: () => {
      require("./hera-validate.ts");
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

Options:
  --help                 Show this help message
  --version              Show version

Examples:
  hera init my-agent
  hera validate ./src
  hera validate .

For more information, see https://github.com/david-aistudio/hera
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
