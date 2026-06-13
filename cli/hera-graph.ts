#!/usr/bin/env node
/**
 * Hera Graph — visualize the knowledge graph built by graphify
 *
 * Usage:
 *   npx hera-graph summary        Show top hubs, communities, density
 *   npx hera-graph query <text>   Search the graph for a concept
 *   npx hera-graph path <a> <b>   Shortest path between two nodes
 *   npx hera-graph explain <node> Get neighbors + relationships
 *   npx hera-graph stats          Just the numbers
 *
 * Requires: graphify installed globally (npm i -g @sentropic/graphify)
 */

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Config
// ============================================================================

const GRAPH_PATH = path.resolve(process.cwd(), ".graphify/graph.json");

// Read version dynamically (avoids version drift between CLI and package.json)
let PKG_VERSION = "?";
try {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  PKG_VERSION = JSON.parse(require("fs").readFileSync(pkgPath, "utf-8")).version;
} catch {
  PKG_VERSION = "2.7.3";
}

const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

// ============================================================================
// Helpers
// ============================================================================

function checkGraph(): void {
  if (!fs.existsSync(GRAPH_PATH)) {
    console.log(`${colors.red}✗ No graph found at ${GRAPH_PATH}${colors.reset}`);
    console.log(`${colors.cyan}Build one with:${colors.reset} npx graphify build`);
    process.exit(1);
  }
}

function runGraphify(args: string[]): string {
  try {
    const out = cp.execSync(`npx --yes graphify ${args.join(" ")} --graph ${GRAPH_PATH}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out;
  } catch (err: any) {
    console.error(`${colors.red}✗ graphify failed:${colors.reset}`, err.message || String(err));
    process.exit(1);
  }
}

// ============================================================================
// Commands
// ============================================================================

function cmdSummary(): void {
  checkGraph();
  console.log(`${colors.bold}${colors.blue}Hera v${PKG_VERSION} — Architecture Knowledge Graph${colors.reset}\n`);
  console.log(runGraphify(["summary"]));
}

function cmdStats(): void {
  checkGraph();
  const out = runGraphify(["summary"]);
  const firstLine = out.split("\n").find((l) => l.startsWith("Graph:"));
  if (firstLine) console.log(firstLine);
}

function cmdQuery(term: string): void {
  if (!term) {
    console.log(`${colors.yellow}Usage: npx hera-graph query <term>${colors.reset}`);
    process.exit(1);
  }
  checkGraph();
  console.log(runGraphify(["query", `"${term}"`]));
}

function cmdPath(a: string, b: string): void {
  if (!a || !b) {
    console.log(`${colors.yellow}Usage: npx hera-graph path <nodeA> <nodeB>${colors.reset}`);
    process.exit(1);
  }
  checkGraph();
  console.log(runGraphify(["path", `"${a}"`, `"${b}"`]));
}

function cmdExplain(node: string): void {
  if (!node) {
    console.log(`${colors.yellow}Usage: npx hera-graph explain <node>${colors.reset}`);
    process.exit(1);
  }
  checkGraph();
  console.log(runGraphify(["explain", `"${node}"`]));
}

function cmdHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}Hera Graph v${PKG_VERSION}${colors.reset} — visualize the knowledge graph

${colors.bold}Usage:${colors.reset}
  npx hera-graph summary              Top hubs, communities, density
  npx hera-graph stats                Just the numbers
  npx hera-graph query <term>         Search the graph for a concept
  npx hera-graph path <a> <b>         Shortest path between two nodes
  npx hera-graph explain <node>       Neighbors + relationships
  npx hera-graph --help               Show this help

${colors.bold}Examples:${colors.reset}
  npx hera-graph summary
  npx hera-graph query "agent loop"
  npx hera-graph path Session Message
  npx hera-graph explain AgentHarness

${colors.bold}Requires:${colors.reset}
  npm i -g @sentropic/graphify
  .graphify/graph.json in current directory
`);
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case "summary":
      cmdSummary();
      break;
    case "stats":
      cmdStats();
      break;
    case "query":
      cmdQuery(args[1]);
      break;
    case "path":
      cmdPath(args[1], args[2]);
      break;
    case "explain":
      cmdExplain(args[1]);
      break;
    case "--help":
    case "-h":
    case undefined:
      cmdHelp();
      break;
    default:
      console.log(`${colors.red}✗ Unknown command: ${cmd}${colors.reset}`);
      cmdHelp();
      process.exit(1);
  }
}

main();
