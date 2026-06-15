/**
 * Tests for agent detection and installation mapping
 *
 * Verifies that:
 * - Each agent maps to the correct config file
 * - Detection logic identifies agents correctly
 * - No agent gets the wrong file installed
 * - The mappings in this test file are CONSISTENT with bin/hera.js
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ============================================================================
// Parse the AGENTS object from bin/hera.js to verify consistency
//
// CRITICAL: Previous tests just mirrored the mapping in this file,
// which meant bugs in bin/hera.js would NOT be caught.
// Now we actually READ and PARSE bin/hera.js to verify the mapping.
// ============================================================================

function parseAgentsFromBin(): Record<string, {
  name: string;
  files: { src: string; dest: string }[];
}> {
  const binContent = fs.readFileSync(path.join(ROOT, "bin", "hera.cjs"), "utf-8");

  // Extract the AGENTS object definition
  const agentsMatch = binContent.match(/const AGENTS = \{([\s\S]*?)\n\};/);
  if (!agentsMatch) {
    throw new Error("Could not parse AGENTS object from bin/hera.js");
  }

  const agentsBlock = agentsMatch[1];
  const result: Record<string, {
    name: string;
    files: { src: string; dest: string }[];
  }> = {};

  // Parse each agent key
  const agentRegex = /(\w+):\s*\{\s*name:\s*'([^']+)',\s*files:\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = agentRegex.exec(agentsBlock)) !== null) {
    const key = match[1];
    const name = match[2];
    const filesBlock = match[3];

    const files: { src: string; dest: string }[] = [];
    const fileRegex = /\{\s*src:\s*'([^']+)',\s*dest:\s*'([^']+)'/g;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(filesBlock)) !== null) {
      files.push({ src: fileMatch[1], dest: fileMatch[2] });
    }

    result[key] = { name, files };
  }

  return result;
}

// ============================================================================
// Parse the DETECTION_PRIORITY from bin/hera.js
// ============================================================================

function parseDetectionPriorityFromBin(): string[] {
  const binContent = fs.readFileSync(path.join(ROOT, "bin", "hera.cjs"), "utf-8");
  const priorityMatch = binContent.match(/const DETECTION_PRIORITY = \[([\s\S]*?)\];/);
  if (!priorityMatch) {
    throw new Error("Could not parse DETECTION_PRIORITY from bin/hera.js");
  }

  const items = priorityMatch[1];
  const keys = items.match(/'(\w+)'/g)?.map((k) => k.replace(/'/g, "")) || [];
  return keys;
}

// ============================================================================
// Agent-to-file mapping (mirrors bin/hera.js AGENTS object)
// ============================================================================

const AGENT_FILE_MAP: Record<string, { name: string; srcFile: string; destFile: string }> = {
  claude: {
    name: "Claude Code",
    srcFile: "CLAUDE.md",
    destFile: "CLAUDE.md",
  },
  hermes: {
    name: "Hermes Agent",
    srcFile: "SKILL.md",
    destFile: "~/.hermes/skills/hera/SKILL.md",
  },
  cursor: {
    name: "Cursor",
    srcFile: ".cursor/rules/hera.mdc",
    destFile: ".cursor/rules/hera.mdc",
  },
  opencode: {
    name: "OpenCode",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  codex: {
    name: "Codex",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  kilo: {
    name: "Kilo Code",
    srcFile: "SKILL.md",
    destFile: ".kilo/skills/hera/SKILL.md",
  },
  kiro: {
    name: "Kiro",
    srcFile: "SKILL.md",
    destFile: ".kiro/skills/hera/SKILL.md",
  },
  aider: {
    name: "Aider",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  gemini: {
    name: "Gemini CLI",
    srcFile: "AGENTS.md",
    destFile: "GEMINI.md",
  },
  pi: {
    name: "Pi coding agent",
    srcFile: "SKILL.md",
    destFile: "~/.pi/agent/skills/hera/SKILL.md",
  },
  copilot: {
    name: "GitHub Copilot CLI",
    srcFile: "SKILL.md",
    destFile: "~/.copilot/skills/hera/SKILL.md",
  },
  devin: {
    name: "Devin CLI",
    srcFile: "SKILL.md",
    destFile: "~/.config/devin/skills/hera/SKILL.md",
  },
  antigravity: {
    name: "Google Antigravity",
    srcFile: ".agents/rules/hera.md",
    destFile: ".agents/rules/hera.md",
  },
  codebuddy: {
    name: "CodeBuddy",
    srcFile: "AGENTS.md",
    destFile: "CODEBUDDY.md",
  },
  amp: {
    name: "Amp",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  trae: {
    name: "Trae",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  claw: {
    name: "OpenClaw",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
  droid: {
    name: "Factory Droid",
    srcFile: "AGENTS.md",
    destFile: "AGENTS.md",
  },
};

// ============================================================================
// Tests: Mapping Correctness
// ============================================================================

describe("Agent file mapping", () => {
  it("every supported agent has a file mapping", () => {
    const agentKeys = Object.keys(AGENT_FILE_MAP);
    expect(agentKeys.length).toBe(18);
  });

  it("Claude Code gets CLAUDE.md, NOT AGENTS.md (the original bug)", () => {
    const claude = AGENT_FILE_MAP.claude;
    expect(claude.srcFile).toBe("CLAUDE.md");
    expect(claude.destFile).toBe("CLAUDE.md");
    // Explicitly NOT AGENTS.md — this is the mismatch bug the user reported
    expect(claude.srcFile).not.toBe("AGENTS.md");
  });

  it("OpenCode gets AGENTS.md", () => {
    const opencode = AGENT_FILE_MAP.opencode;
    expect(opencode.srcFile).toBe("AGENTS.md");
    expect(opencode.destFile).toBe("AGENTS.md");
  });

  it("Cursor gets .cursor/rules/hera.mdc", () => {
    const cursor = AGENT_FILE_MAP.cursor;
    expect(cursor.srcFile).toBe(".cursor/rules/hera.mdc");
    expect(cursor.destFile).toBe(".cursor/rules/hera.mdc");
  });

  it("Hermes gets SKILL.md in home directory", () => {
    const hermes = AGENT_FILE_MAP.hermes;
    expect(hermes.srcFile).toBe("SKILL.md");
    expect(hermes.destFile).toContain(".hermes/skills/hera/SKILL.md");
  });

  it("Gemini gets AGENTS.md renamed to GEMINI.md", () => {
    const gemini = AGENT_FILE_MAP.gemini;
    expect(gemini.srcFile).toBe("AGENTS.md");
    expect(gemini.destFile).toBe("GEMINI.md");
  });

  it("CodeBuddy gets AGENTS.md renamed to CODEBUDDY.md", () => {
    const codebuddy = AGENT_FILE_MAP.codebuddy;
    expect(codebuddy.srcFile).toBe("AGENTS.md");
    expect(codebuddy.destFile).toBe("CODEBUDDY.md");
  });

  it("skill-based agents (Kilo, Kiro, Pi, Copilot, Devin) get SKILL.md", () => {
    const skillAgents = ["kilo", "kiro", "pi", "copilot", "devin"];
    for (const key of skillAgents) {
      expect(AGENT_FILE_MAP[key].srcFile).toBe("SKILL.md");
      expect(AGENT_FILE_MAP[key].destFile).toContain("SKILL.md");
    }
  });

  it("agents that share AGENTS.md are: opencode, codex, aider, amp, trae, claw, droid", () => {
    const agentsMdAgents = ["opencode", "codex", "aider", "amp", "trae", "claw", "droid"];
    for (const key of agentsMdAgents) {
      expect(AGENT_FILE_MAP[key].srcFile).toBe("AGENTS.md");
      expect(AGENT_FILE_MAP[key].destFile).toBe("AGENTS.md");
    }
  });

  it("no two agents share the same destFile (except AGENTS.md-based ones)", () => {
    const destFiles = Object.values(AGENT_FILE_MAP).map((a) => a.destFile);
    const unique = new Set(destFiles);
    const agentsMdCount = destFiles.filter((d) => d === "AGENTS.md").length;
    expect(unique.size).toBe(destFiles.length - agentsMdCount + 1);
  });
});

// ============================================================================
// Tests: Consistency with bin/hera.js (the ACTUAL source of truth)
// ============================================================================

describe("Mapping consistency with bin/hera.js", () => {
  let binAgents: Record<string, { name: string; files: { src: string; dest: string }[] }>;

  beforeAll(() => {
    binAgents = parseAgentsFromBin();
  });

  it("bin/hera.js has exactly 18 agents", () => {
    expect(Object.keys(binAgents).length).toBe(18);
  });

  it("every agent in AGENT_FILE_MAP exists in bin/hera.js", () => {
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      expect(binAgents[key], `Agent ${key} should exist in bin/hera.js`).toBeDefined();
    }
  });

  it("every agent in bin/hera.js exists in AGENT_FILE_MAP", () => {
    for (const key of Object.keys(binAgents)) {
      expect(AGENT_FILE_MAP[key], `Agent ${key} should exist in test mapping`).toBeDefined();
    }
  });

  it("Claude Code in bin/hera.js maps to CLAUDE.md (NOT AGENTS.md)", () => {
    const claude = binAgents.claude;
    expect(claude).toBeDefined();
    expect(claude.files).toHaveLength(1);
    expect(claude.files[0].src).toBe("CLAUDE.md");
    expect(claude.files[0].dest).toBe("CLAUDE.md");
    // NOT AGENTS.md
    expect(claude.files[0].src).not.toBe("AGENTS.md");
    expect(claude.files[0].dest).not.toBe("AGENTS.md");
  });

  it("OpenCode in bin/hera.js maps to AGENTS.md", () => {
    const opencode = binAgents.opencode;
    expect(opencode).toBeDefined();
    expect(opencode.files).toHaveLength(1);
    expect(opencode.files[0].src).toBe("AGENTS.md");
    expect(opencode.files[0].dest).toBe("AGENTS.md");
  });

  it("Cursor in bin/hera.js maps to .cursor/rules/hera.mdc", () => {
    const cursor = binAgents.cursor;
    expect(cursor).toBeDefined();
    expect(cursor.files).toHaveLength(1);
    expect(cursor.files[0].src).toBe(".cursor/rules/hera.mdc");
    expect(cursor.files[0].dest).toBe(".cursor/rules/hera.mdc");
  });

  it("all agent names in bin/hera.js match AGENT_FILE_MAP", () => {
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      expect(binAgents[key].name).toBe(AGENT_FILE_MAP[key].name);
    }
  });

  it("all source files in bin/hera.js match AGENT_FILE_MAP", () => {
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      expect(binAgents[key].files[0].src).toBe(AGENT_FILE_MAP[key].srcFile);
    }
  });

  it("all destination files in bin/hera.js match AGENT_FILE_MAP", () => {
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      expect(binAgents[key].files[0].dest).toBe(AGENT_FILE_MAP[key].destFile);
    }
  });

  it("Antigravity in bin/hera.js has 2 files (rules + workflows)", () => {
    const ag = binAgents.antigravity;
    expect(ag).toBeDefined();
    expect(ag.files).toHaveLength(2);
    expect(ag.files[0].src).toBe(".agents/rules/hera.md");
    expect(ag.files[1].src).toBe(".agents/workflows/hera.md");
  });
});

// ============================================================================
// Tests: Detection Priority
// ============================================================================

describe("Agent detection priority", () => {
  let detectionPriority: string[];

  beforeAll(() => {
    detectionPriority = parseDetectionPriorityFromBin();
  });

  it("DETECTION_PRIORITY has 18 agents", () => {
    expect(detectionPriority.length).toBe(18);
  });

  it("Claude Code is first in detection priority", () => {
    expect(detectionPriority[0]).toBe("claude");
  });

  it("Claude Code has higher priority than OpenCode", () => {
    const claudeIdx = detectionPriority.indexOf("claude");
    const opencodeIdx = detectionPriority.indexOf("opencode");
    expect(claudeIdx).toBeLessThan(opencodeIdx);
  });

  it("Claude Code has higher priority than Cursor", () => {
    const claudeIdx = detectionPriority.indexOf("claude");
    const cursorIdx = detectionPriority.indexOf("cursor");
    expect(claudeIdx).toBeLessThan(cursorIdx);
  });

  it("all agents in AGENT_FILE_MAP are in DETECTION_PRIORITY", () => {
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      expect(detectionPriority).toContain(key);
    }
  });

  it("all agents in DETECTION_PRIORITY are in AGENT_FILE_MAP", () => {
    for (const key of detectionPriority) {
      expect(AGENT_FILE_MAP[key]).toBeDefined();
    }
  });
});

// ============================================================================
// Tests: Detection Markers
// ============================================================================

describe("Agent detection markers", () => {
  const DETECTION_MARKERS: Record<string, string[]> = {
    claude: ["CLAUDE.md", ".claude"],
    hermes: ["~/.hermes", "~/.hermes/config.yaml"],
    cursor: [".cursor", ".cursorrules"],
    opencode: ["opencode.json", ".opencode"],
    kilo: [".kilo"],
    kiro: [".kiro"],
    aider: [".aider.conf.yml", ".aider"],
    gemini: ["GEMINI.md", ".gemini"],
    pi: ["~/.pi"],
    codex: ["codex.json", ".codex"],
    antigravity: [".agents"],
    codebuddy: ["CODEBUDDY.md", ".codebuddy"],
    amp: ["amp.json", ".amp"],
    trae: ["trae.json", ".trae"],
    claw: [".claw", "claw.json", ".claw/config.json"],
    droid: [".droid", "droid.json", ".droid/config.json"],
    copilot: ["~/.copilot"],
    devin: ["~/.config/devin"],
  };

  it("every agent that has detection markers is in the file map", () => {
    for (const key of Object.keys(DETECTION_MARKERS)) {
      expect(AGENT_FILE_MAP[key]).toBeDefined();
    }
  });

  it("Claude Code detection markers do not overlap with OpenCode", () => {
    const claudeMarkers = DETECTION_MARKERS.claude;
    const opencodeMarkers = DETECTION_MARKERS.opencode;
    const overlap = claudeMarkers.filter((m) => opencodeMarkers.includes(m));
    expect(overlap).toHaveLength(0);
  });

  it("agents without detection markers still have file mappings", () => {
    // All agents should now have some detection signal
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      const markers = DETECTION_MARKERS[key];
      // At minimum, each agent should have some marker
      expect(markers, `Agent ${key} should have detection markers`).toBeDefined();
      expect(markers.length, `Agent ${key} should have at least 1 detection marker`).toBeGreaterThan(0);
    }
  });

  it("bin/hera.js has detect property for all agents", () => {
    const binContent = fs.readFileSync(path.join(ROOT, "bin", "hera.cjs"), "utf-8");
    for (const key of Object.keys(AGENT_FILE_MAP)) {
      // Each agent should have a detect property in bin/hera.js
      expect(binContent).toMatch(new RegExp(`${key}:\\s*\\{[\\s\\S]*?detect:`));
    }
  });
});
