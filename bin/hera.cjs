#!/usr/bin/env node

/**
 * Hera — AI Coding Agent Architecture Reference
 * CLI installer for 18+ AI coding agents
 *
 * Usage:
 *   npx hera-agent              # Auto-detect and install (with confirmation)
 *   npx hera-agent claude       # Install for Claude Code
 *   npx hera-agent hermes       # Install for Hermes Agent
 *   npx hera-agent cursor       # Install for Cursor
 *   npx hera-agent all          # Install for all agents
 *   npx hera-agent --help       # Show help
 *   npx hera-agent list         # List all supported agents
 *   npx hera-agent uninstall    # Uninstall Hera from agent
 *
 * Flags:
 *   --yes, -y                   Skip confirmation prompt (for CI/CD)
 *   --version-tag <tag>         Install specific version/tag (default: main)
 *
 * Subcommands (built-in):
 *   npx hera-agent graph <cmd>  # Visualize graphify knowledge graph
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const readline = require('readline');

// Colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// Read version + metadata from package.json dynamically
// (avoids the "version drift" bug where the banner falls behind reality)
let PKG_META = { version: '?', description: '', repository: { url: '' } };
try {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  PKG_META = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
} catch (err) {
  // Fall back to hardcoded values if package.json can't be read
  PKG_META = { version: '2.10.0', description: 'Hera — AI Coding Agent Architecture Reference', repository: { url: 'https://github.com/ahmdd4vd/hera.git' } };
}

// Derive GitHub URL from package.json repository field (avoids hardcoding wrong repo)
const GITHUB_REPO = PKG_META.repository?.url
  ?.replace('https://github.com/', '')
  ?.replace('.git', '') || 'ahmdd4vd/hera';

// Version tag support: --version-tag <tag> allows installing from a specific branch/tag
// Default is 'main'
let VERSION_TAG = 'main';

function getGitHubRaw() {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${VERSION_TAG}`;
}

// Subcommand dispatch (graph, etc.)
const SUBCOMMANDS = ['graph'];

// ============================================================================
// Supported agents and their install configs
// Each agent maps to a specific source file and destination path.
// IMPORTANT: Each agent MUST have a unique src→dest mapping.
//
// AGENTS.md conflict resolution:
// Multiple agents (opencode, codex, aider, amp, trae, claw, droid) share
// AGENTS.md as dest. When installing for one of these, we check if AGENTS.md
// already exists and contains Hera content from a DIFFERENT agent. If so,
// we warn the user and append a section rather than overwriting.
// ============================================================================

// Agents that share AGENTS.md as destination
const AGENTS_MD_SHARING_AGENTS = ['opencode', 'codex', 'aider', 'amp', 'trae', 'claw', 'droid'];

const AGENTS = {
  claude: {
    name: 'Claude Code',
    files: [{ src: 'CLAUDE.md', dest: 'CLAUDE.md', type: 'file' }],
    // Detection markers — what files/dirs/commands indicate this agent is present
    detect: {
      files: ['CLAUDE.md'],
      dirs: ['.claude'],
      commands: ['claude'],
      // Additional signals beyond simple file/dir/command checks
      hints: [
        'Claude Code creates .claude/ directory in project root',
        'If you use Claude Code via Anthropic CLI, "claude" command is available',
        'CLAUDE.md is the project-level instructions file for Claude Code',
      ],
    },
  },
  hermes: {
    name: 'Hermes Agent',
    files: [{ src: 'SKILL.md', dest: '~/.hermes/skills/hera/SKILL.md', type: 'home' }],
    detect: {
      files: [],
      dirs: [],
      homeDirs: ['.hermes'],
      homeFiles: ['.hermes/config.yaml'],
      commands: ['hermes'],
      hints: ['Hermes Agent stores skills in ~/.hermes/skills/'],
    },
  },
  cursor: {
    name: 'Cursor',
    files: [{ src: '.cursor/rules/hera.mdc', dest: '.cursor/rules/hera.mdc', type: 'dir' }],
    detect: {
      files: ['.cursorrules'],
      dirs: ['.cursor'],
      commands: ['cursor'],
      hints: ['Cursor uses .cursor/rules/*.mdc for project rules'],
    },
  },
  opencode: {
    name: 'OpenCode',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['opencode.json'],
      dirs: ['.opencode'],
      commands: ['opencode'],
      hints: ['OpenCode uses AGENTS.md as project-level instructions'],
    },
  },
  codex: {
    name: 'Codex',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['codex.json'],
      dirs: ['.codex'],
      commands: ['codex'],
      hints: ['OpenAI Codex uses AGENTS.md as project-level instructions'],
    },
  },
  kilo: {
    name: 'Kilo Code',
    files: [{ src: 'SKILL.md', dest: '.kilo/skills/hera/SKILL.md', type: 'dir' }],
    detect: {
      files: [],
      dirs: ['.kilo'],
      commands: [],
      hints: ['Kilo Code stores skills in .kilo/skills/'],
    },
  },
  kiro: {
    name: 'Kiro',
    files: [{ src: 'SKILL.md', dest: '.kiro/skills/hera/SKILL.md', type: 'dir' }],
    detect: {
      files: [],
      dirs: ['.kiro'],
      commands: [],
      hints: ['Kiro stores skills in .kiro/skills/'],
    },
  },
  aider: {
    name: 'Aider',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['.aider.conf.yml'],
      dirs: ['.aider'],
      commands: ['aider'],
      hints: ['Aider uses .aider.conf.yml for configuration'],
    },
  },
  gemini: {
    name: 'Gemini CLI',
    files: [{ src: 'AGENTS.md', dest: 'GEMINI.md', type: 'file' }],
    detect: {
      files: ['GEMINI.md'],
      dirs: ['.gemini'],
      commands: ['gemini'],
      hints: ['Gemini CLI uses GEMINI.md as project-level instructions'],
    },
  },
  pi: {
    name: 'Pi coding agent',
    files: [{ src: 'SKILL.md', dest: '~/.pi/agent/skills/hera/SKILL.md', type: 'home' }],
    detect: {
      files: [],
      dirs: [],
      homeDirs: ['.pi'],
      commands: [],
      hints: ['Pi stores skills in ~/.pi/agent/skills/'],
    },
  },
  copilot: {
    name: 'GitHub Copilot CLI',
    files: [{ src: 'SKILL.md', dest: '~/.copilot/skills/hera/SKILL.md', type: 'home' }],
    detect: {
      files: [],
      dirs: [],
      homeDirs: ['.copilot'],
      commands: ['github-copilot-cli', 'copilot'],
      hints: ['GitHub Copilot CLI stores skills in ~/.copilot/skills/'],
    },
  },
  devin: {
    name: 'Devin CLI',
    files: [{ src: 'SKILL.md', dest: '~/.config/devin/skills/hera/SKILL.md', type: 'home' }],
    detect: {
      files: [],
      dirs: [],
      homeDirs: ['.config/devin'],
      commands: ['devin'],
      hints: ['Devin CLI stores skills in ~/.config/devin/skills/'],
    },
  },
  antigravity: {
    name: 'Google Antigravity',
    files: [
      { src: '.agents/rules/hera.md', dest: '.agents/rules/hera.md', type: 'dir' },
      { src: '.agents/workflows/hera.md', dest: '.agents/workflows/hera.md', type: 'dir' },
    ],
    detect: {
      files: [],
      dirs: ['.agents'],
      commands: ['antigravity'],
      hints: ['Google Antigravity uses .agents/rules/ and .agents/workflows/'],
    },
  },
  codebuddy: {
    name: 'CodeBuddy',
    files: [{ src: 'AGENTS.md', dest: 'CODEBUDDY.md', type: 'file' }],
    detect: {
      files: ['CODEBUDDY.md'],
      dirs: ['.codebuddy'],
      commands: ['codebuddy'],
      hints: ['CodeBuddy uses CODEBUDDY.md as project-level instructions'],
    },
  },
  amp: {
    name: 'Amp',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['amp.json'],
      dirs: ['.amp'],
      commands: ['amp'],
      hints: ['Amp uses AGENTS.md as project-level instructions'],
    },
  },
  trae: {
    name: 'Trae',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['trae.json'],
      dirs: ['.trae'],
      commands: ['trae'],
      hints: ['Trae uses AGENTS.md as project-level instructions'],
    },
  },
  claw: {
    name: 'OpenClaw',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['claw.json', '.claw/config.json'],
      dirs: ['.claw'],
      commands: ['claw'],
      homeDirs: ['.claw'],
      hints: [
        'OpenClaw uses AGENTS.md as project-level instructions',
        'OpenClaw stores config in .claw/ directory or ~/.claw/',
      ],
    },
  },
  droid: {
    name: 'Factory Droid',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
    detect: {
      files: ['droid.json', '.droid/config.json'],
      dirs: ['.droid'],
      commands: ['droid'],
      homeDirs: ['.droid'],
      hints: [
        'Factory Droid uses AGENTS.md as project-level instructions',
        'Factory Droid stores config in .droid/ directory or ~/.droid/',
      ],
    },
  },
};

// ============================================================================
// Detection priority — agents higher in this list are detected first when
// multiple agents have markers present. This is intentional: agents with
// more specific markers should be detected before agents with generic ones.
// ============================================================================

const DETECTION_PRIORITY = [
  'claude',      // Claude Code — most popular, specific CLAUDE.md marker
  'hermes',      // Hermes Agent — specific ~/.hermes marker
  'cursor',      // Cursor — specific .cursor directory
  'kilo',        // Kilo Code — specific .kilo directory
  'kiro',        // Kiro — specific .kiro directory
  'antigravity', // Antigravity — specific .agents directory
  'aider',       // Aider — specific .aider.conf.yml
  'gemini',      // Gemini — specific GEMINI.md
  'opencode',    // OpenCode — AGENTS.md (shared with codex, aider, etc.)
  'codex',       // Codex — AGENTS.md (shared)
  'pi',          // Pi — specific ~/.pi marker
  'copilot',     // Copilot — ~/.copilot marker
  'devin',       // Devin — ~/.config/devin marker
  'codebuddy',   // CodeBuddy — CODEBUDDY.md
  'amp',         // Amp — AGENTS.md (shared)
  'trae',        // Trae — AGENTS.md (shared)
  'claw',        // OpenClaw — AGENTS.md (shared)
  'droid',       // Factory Droid — AGENTS.md (shared)
];

// ============================================================================
// Auto-detect agent
//
// CRITICAL FIX: Previous version detected agents by checking if their
// marker files ALREADY existed. But the whole point of installing Hera
// is to CREATE those files! This meant:
//   1. First-time installs couldn't auto-detect (no markers exist yet)
//   2. Projects with multiple agent markers got wrong detection
//
// New approach:
//   1. Check ALL agent markers (files, dirs, commands, home dirs)
//   2. Score each agent based on how many markers are found
//   3. Return ALL detected agents (not just first match)
//   4. If multiple agents detected, ask user to confirm
//   5. If no agents detected, show interactive selection
// ============================================================================

function detectAgent() {
  const cwd = process.cwd();
  const home = require('os').homedir();
  const results = [];

  for (const agentKey of DETECTION_PRIORITY) {
    const agent = AGENTS[agentKey];
    if (!agent.detect) continue;

    const detected = detectSingleAgent(agentKey, agent, cwd, home);
    if (detected.score > 0) {
      results.push(detected);
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  return results;
}

function detectSingleAgent(agentKey, agent, cwd, home) {
  const detect = agent.detect;
  let score = 0;
  const matchedMarkers = [];

  // Check project files
  if (detect.files) {
    for (const file of detect.files) {
      if (fs.existsSync(path.join(cwd, file))) {
        score += 2; // File in project root is strong signal
        matchedMarkers.push(`file:${file}`);
      }
    }
  }

  // Check project directories
  if (detect.dirs) {
    for (const dir of detect.dirs) {
      if (fs.existsSync(path.join(cwd, dir))) {
        score += 2; // Directory in project root is strong signal
        matchedMarkers.push(`dir:${dir}`);
      }
    }
  }

  // Check home directory dirs
  if (detect.homeDirs) {
    for (const dir of detect.homeDirs) {
      if (fs.existsSync(path.join(home, dir))) {
        score += 1; // Home dir is weaker signal (could be leftover)
        matchedMarkers.push(`homeDir:${dir}`);
      }
    }
  }

  // Check home directory files
  if (detect.homeFiles) {
    for (const file of detect.homeFiles) {
      if (fs.existsSync(path.join(home, file))) {
        score += 1;
        matchedMarkers.push(`homeFile:${file}`);
      }
    }
  }

  // Check commands
  if (detect.commands) {
    for (const cmd of detect.commands) {
      if (isCommandAvailable(cmd)) {
        score += 3; // Available command is strongest signal
        matchedMarkers.push(`cmd:${cmd}`);
      }
    }
  }

  return { agentKey, name: agent.name, score, matchedMarkers };
}

function isCommandAvailable(cmd) {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Download file from GitHub
//
// CRITICAL FIX: Previous version had weak content validation:
//   - Only checked content.length > 10 (HTML error pages pass this)
//   - No content-type validation
//   - Redirect handling didn't validate final response
//
// New approach:
//   1. Validate HTTP status code
//   2. Validate content-type is text/markdown or text/plain
//   3. Validate content looks like markdown (starts with # or ---)
//   4. Better redirect handling
// ============================================================================

function downloadFile(filePath) {
  return new Promise((resolve, reject) => {
    const url = `${getGitHubRaw()}/${filePath}`;

    const doRequest = (requestUrl, redirects = 0) => {
      if (redirects > 5) {
        reject(new Error(`Too many redirects for ${filePath}`));
        return;
      }

      const client = requestUrl.startsWith('https') ? https : http;
      client
        .get(requestUrl, (res) => {
          // Handle redirects
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            const location = res.headers.location;
            if (!location) {
              reject(new Error(`Redirect with no Location header for ${filePath}`));
              res.resume();
              return;
            }
            res.resume();
            doRequest(location, redirects + 1);
            return;
          }

          // Check for non-200 status
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${filePath}`));
            res.resume();
            return;
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            // Validate content looks like actual markdown, not an error page
            if (!validateDownloadedContent(filePath, data)) {
              reject(new Error(`Downloaded ${filePath} failed content validation (may be an error page)`));
              return;
            }
            resolve(data);
          });
        })
        .on('error', reject);
    };

    doRequest(url);
  });
}

/**
 * Validate that downloaded content is actual markdown, not an HTML error page.
 *
 * Checks:
 * 1. Content is not too short (at least 50 chars for real markdown)
 * 2. Content does not start with HTML tags (<!DOCTYPE, <html, <head)
 * 3. Content contains markdown indicators (# headings, --- frontmatter, etc.)
 */
function validateDownloadedContent(filePath, content) {
  // Must have reasonable length
  if (!content || content.length < 50) {
    return false;
  }

  const trimmed = content.trim();

  // Must not be HTML error page
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<!doctype')
  ) {
    return false;
  }

  // Should contain markdown indicators
  const hasMarkdownIndicators =
    trimmed.startsWith('#') ||
    trimmed.startsWith('---') ||
    trimmed.startsWith('**') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('```') ||
    trimmed.includes('Hera') ||
    trimmed.includes('Agent') ||
    trimmed.includes('Architecture');

  return hasMarkdownIndicators;
}

// Expand ~ to home directory
function expandHome(filepath) {
  if (filepath.startsWith('~')) {
    return path.join(require('os').homedir(), filepath.slice(1));
  }
  return filepath;
}

// ============================================================================
// AGENTS.md conflict handling
//
// When multiple agents share AGENTS.md as their dest file (opencode, codex,
// aider, amp, trae, claw, droid), installing for one could overwrite content
// from another. We handle this by:
//
// 1. If AGENTS.md doesn't exist → create normally
// 2. If AGENTS.md exists and contains Hera → skip (already installed)
// 3. If AGENTS.md exists and does NOT contain Hera → backup and overwrite
// 4. If AGENTS.md exists and contains Hera from a DIFFERENT sharing agent →
//    warn user, but proceed with overwrite (they explicitly chose this agent)
// ============================================================================

function checkAgentsMdConflict(destPath, agentKey) {
  if (!AGENTS_MD_SHARING_AGENTS.includes(agentKey)) {
    return { conflict: false };
  }

  if (!fs.existsSync(destPath)) {
    return { conflict: false };
  }

  const existing = fs.readFileSync(destPath, 'utf8');
  if (!existing.includes('Hera')) {
    return { conflict: false, hasExistingContent: true };
  }

  // Check if it was installed by a different agent
  // We track which agent installed AGENTS.md via a comment marker
  const agentMarker = `<!-- hera-installed-for: ${agentKey} -->`;
  if (existing.includes('<!-- hera-installed-for:')) {
    if (existing.includes(agentMarker)) {
      // Same agent — already installed
      return { conflict: false, alreadyInstalled: true };
    }
    // Different agent installed it
    const existingAgentMatch = existing.match(/<!-- hera-installed-for: (\w+) -->/);
    const existingAgent = existingAgentMatch ? existingAgentMatch[1] : 'unknown';
    return { conflict: true, existingAgent, alreadyInstalled: false };
  }

  // Hera content exists but no agent marker — legacy install
  return { conflict: false, alreadyInstalled: true, legacy: true };
}

// ============================================================================
// Install for a specific agent
//
// CRITICAL FIX: Previous version silently continued on download failure,
// which could leave the user with partial/corrupt installs.
//
// New approach:
// 1. Validate content before writing
// 2. Create backup of existing files before overwriting
// 3. Report clear success/failure for each file
// 4. Track overall success/failure
// 5. Handle AGENTS.md conflicts between sharing agents
// ============================================================================

async function installAgent(agentKey, options = {}) {
  const agent = AGENTS[agentKey];
  if (!agent) {
    console.log(`${colors.red}✗ Unknown agent: ${agentKey}${colors.reset}`);
    console.log(`${colors.cyan}Run${colors.reset} npx hera-agent list ${colors.cyan}for available agents.${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}ℹ Installing for ${agent.name}...${colors.reset}`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const file of agent.files) {
    const destPath = expandHome(file.dest);
    const destDir = path.dirname(destPath);

    // Create directory if needed
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(destPath)) {
      const existing = fs.readFileSync(destPath, 'utf8');

      // Check for AGENTS.md conflict between sharing agents
      const conflictCheck = checkAgentsMdConflict(destPath, agentKey);
      if (conflictCheck.alreadyInstalled) {
        console.log(`${colors.yellow}⚠ ${file.dest} already contains Hera — skipping${colors.reset}`);
        skipCount++;
        continue;
      }
      if (conflictCheck.conflict) {
        console.log(`${colors.yellow}⚠ ${file.dest} was installed for a different agent (${conflictCheck.existingAgent})${colors.reset}`);
        console.log(`${colors.yellow}⚠ Overwriting with ${agentKey} version...${colors.reset}`);
      }

      if (existing.includes('Hera') && !conflictCheck.conflict) {
        console.log(`${colors.yellow}⚠ ${file.dest} already contains Hera — skipping${colors.reset}`);
        skipCount++;
        continue;
      }
      // Backup existing file before overwriting
      if (!options.noBackup) {
        const backupPath = destPath + '.hera-backup';
        try {
          fs.copyFileSync(destPath, backupPath);
          console.log(`${colors.dim}  Backup: ${backupPath}${colors.reset}`);
        } catch (err) {
          console.log(`${colors.yellow}⚠ Could not backup ${file.dest}: ${err.message}${colors.reset}`);
        }
      }
    }

    // Download and write file
    try {
      const content = await downloadFile(file.src);

      // Add agent marker for AGENTS.md-sharing agents to track which agent installed it
      let finalContent = content;
      if (AGENTS_MD_SHARING_AGENTS.includes(agentKey) && file.dest === 'AGENTS.md') {
        const agentMarker = `<!-- hera-installed-for: ${agentKey} -->`;
        // Prepend marker after any frontmatter
        if (finalContent.startsWith('---')) {
          const endOfFrontmatter = finalContent.indexOf('---', 3);
          if (endOfFrontmatter !== -1) {
            finalContent = finalContent.slice(0, endOfFrontmatter + 3) + '\n' + agentMarker + finalContent.slice(endOfFrontmatter + 3);
          } else {
            finalContent = agentMarker + '\n' + finalContent;
          }
        } else {
          finalContent = agentMarker + '\n' + finalContent;
        }
      }

      fs.writeFileSync(destPath, finalContent, 'utf8');
      console.log(`${colors.green}✓ Created ${file.dest}${colors.reset}`);
      successCount++;
    } catch (err) {
      console.log(`${colors.red}✗ Failed to install ${file.src} → ${file.dest}: ${err.message}${colors.reset}`);
      failCount++;
    }
  }

  // Summary
  if (failCount > 0) {
    console.log(`${colors.yellow}⚠ ${agent.name}: ${successCount} succeeded, ${failCount} failed, ${skipCount} skipped${colors.reset}`);
    return false;
  }

  return true;
}

// Install for all agents
async function installAll() {
  console.log(`${colors.blue}ℹ Installing for all agents...${colors.reset}`);
  let totalSuccess = 0;
  let totalFail = 0;

  for (const agentKey of Object.keys(AGENTS)) {
    try {
      const success = await installAgent(agentKey, { noBackup: true });
      if (success) totalSuccess++;
      else totalFail++;
    } catch (err) {
      totalFail++;
    }
  }

  if (totalFail > 0) {
    console.log(`${colors.yellow}⚠ ${totalSuccess} agents succeeded, ${totalFail} agents had failures${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Installed for all ${totalSuccess} agents!${colors.reset}`);
  }
}

// ============================================================================
// Uninstall Hera from a specific agent
//
// Removes Hera files and restores backups if available.
// ============================================================================

async function uninstallAgent(agentKey) {
  const agent = AGENTS[agentKey];
  if (!agent) {
    console.log(`${colors.red}✗ Unknown agent: ${agentKey}${colors.reset}`);
    console.log(`${colors.cyan}Run${colors.reset} npx hera-agent list ${colors.cyan}for available agents.${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}ℹ Uninstalling from ${agent.name}...${colors.reset}`);

  let removedCount = 0;
  let restoredCount = 0;
  let skipCount = 0;

  for (const file of agent.files) {
    const destPath = expandHome(file.dest);
    const backupPath = destPath + '.hera-backup';

    if (!fs.existsSync(destPath)) {
      console.log(`${colors.dim}  ${file.dest} does not exist — skipping${colors.reset}`);
      skipCount++;
      continue;
    }

    const content = fs.readFileSync(destPath, 'utf8');
    if (!content.includes('Hera')) {
      console.log(`${colors.yellow}⚠ ${file.dest} does not contain Hera — skipping${colors.reset}`);
      skipCount++;
      continue;
    }

    // Restore backup if available
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, destPath);
        fs.unlinkSync(backupPath);
        console.log(`${colors.green}✓ Restored ${file.dest} from backup${colors.reset}`);
        restoredCount++;
      } catch (err) {
        console.log(`${colors.yellow}⚠ Could not restore backup: ${err.message}${colors.reset}`);
        // Try to just remove the file
        try {
          fs.unlinkSync(destPath);
          console.log(`${colors.green}✓ Removed ${file.dest}${colors.reset}`);
          removedCount++;
        } catch (rmErr) {
          console.log(`${colors.red}✗ Could not remove ${file.dest}: ${rmErr.message}${colors.reset}`);
        }
      }
    } else {
      // No backup — just remove the file
      try {
        fs.unlinkSync(destPath);
        console.log(`${colors.green}✓ Removed ${file.dest}${colors.reset}`);
        removedCount++;
      } catch (err) {
        console.log(`${colors.red}✗ Could not remove ${file.dest}: ${err.message}${colors.reset}`);
      }
    }
  }

  // Summary
  console.log(`${colors.blue}ℹ ${agent.name}: ${removedCount} removed, ${restoredCount} restored, ${skipCount} skipped${colors.reset}`);
}

// ============================================================================
// Interactive agent selection
//
// CRITICAL FIX: Previous version had NO interactive mode in the JS CLI.
// If auto-detection failed, the user was just told to specify an agent.
// Now we provide a numbered selection menu (like install.sh does).
// ============================================================================

async function interactiveSelect() {
  const agentKeys = Object.keys(AGENTS);

  console.log('');
  console.log(`${colors.cyan}${colors.bold}Which AI coding agent do you use?${colors.reset}`);
  console.log('');

  agentKeys.forEach((key, i) => {
    const agent = AGENTS[key];
    console.log(`  ${colors.green}${String(i + 1).padStart(2)}${colors.reset})  ${colors.bold}${agent.name}${colors.reset}  ${colors.dim}(npx hera-agent ${key})${colors.reset}`);
  });

  console.log(`  ${colors.green}${String(agentKeys.length + 1).padStart(2)}${colors.reset})  ${colors.bold}All agents${colors.reset}`);
  console.log('');

  const answer = await askQuestion(`Enter number (1-${agentKeys.length + 1}): `);
  const choice = parseInt(answer, 10);

  if (isNaN(choice) || choice < 1 || choice > agentKeys.length + 1) {
    console.log(`${colors.red}✗ Invalid choice${colors.reset}`);
    process.exit(1);
  }

  if (choice === agentKeys.length + 1) {
    return 'all';
  }

  return agentKeys[choice - 1];
}

function askQuestion(question) {
  return new Promise((resolve) => {
    // Non-TTY detection: if stdin is not a TTY (e.g., CI/CD pipeline),
    // we can't ask questions. Return empty string and let the caller handle it.
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================================
// List supported agents
// ============================================================================

function listAgents() {
  const agentKeys = Object.keys(AGENTS);
  console.log('');
  console.log(`${colors.bold}${colors.cyan}Supported AI Agents (${agentKeys.length})${colors.reset}`);
  console.log('');

  for (const key of agentKeys) {
    const agent = AGENTS[key];
    const destInfo = agent.files.map((f) => `${f.src} → ${f.dest}`).join(', ');
    const detectInfo = agent.detect
      ? [
          ...(agent.detect.files || []).map((f) => `${f}`),
          ...(agent.detect.dirs || []).map((d) => `${d}/`),
          ...(agent.detect.commands || []).map((c) => `cmd:${c}`),
          ...(agent.detect.homeDirs || []).map((d) => `~${d}/`),
        ].join(', ')
      : 'manual';
    console.log(`  ${colors.bold}${key.padEnd(14)}${colors.reset} ${agent.name}`);
    console.log(`  ${''.padEnd(14)} ${colors.dim}Install: ${destInfo}${colors.reset}`);
    if (detectInfo && detectInfo !== 'manual') {
      console.log(`  ${''.padEnd(14)} ${colors.dim}Detect:  ${detectInfo}${colors.reset}`);
    }
  }

  console.log('');
  console.log(`${colors.cyan}Usage:${colors.reset} npx hera-agent <agent-key>`);
  console.log(`${colors.cyan}Uninstall:${colors.reset} npx hera-agent uninstall <agent-key>`);
  console.log('');
}

// Show help
function showHelp() {
  console.log(`
${colors.bold}Hera — AI Coding Agent Architecture Reference${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx hera-agent                    Auto-detect and install (with confirmation)
  npx hera-agent <agent>            Install for specific agent
  npx hera-agent all                Install for all agents
  npx hera-agent uninstall <agent>  Uninstall from specific agent
  npx hera-agent list               List all supported agents
  npx hera-agent --help             Show this help

${colors.cyan}Flags:${colors.reset}
  --yes, -y                    Skip confirmation prompt (CI/CD friendly)
  --version-tag <tag>          Install from specific git tag/branch (default: main)

${colors.cyan}Supported agents:${colors.reset}
  claude        Claude Code          → CLAUDE.md
  hermes        Hermes Agent         → ~/.hermes/skills/hera/SKILL.md
  cursor        Cursor               → .cursor/rules/hera.mdc
  opencode      OpenCode             → AGENTS.md
  codex         Codex                → AGENTS.md
  kilo          Kilo Code            → .kilo/skills/hera/SKILL.md
  kiro          Kiro                 → .kiro/skills/hera/SKILL.md
  aider         Aider                → AGENTS.md
  gemini        Gemini CLI           → GEMINI.md
  pi            Pi coding agent      → ~/.pi/agent/skills/hera/SKILL.md
  copilot       GitHub Copilot CLI   → ~/.copilot/skills/hera/SKILL.md
  devin         Devin CLI            → ~/.config/devin/skills/hera/SKILL.md
  antigravity   Google Antigravity   → .agents/rules/ + .agents/workflows/
  codebuddy     CodeBuddy            → CODEBUDDY.md
  amp           Amp                  → AGENTS.md
  trae          Trae                 → AGENTS.md
  claw          OpenClaw             → AGENTS.md
  droid         Factory Droid        → AGENTS.md

${colors.cyan}Detection:${colors.reset}
  Hera auto-detects your agent by checking for marker files and commands.
  If multiple agents are detected, you will be asked to confirm.
  If no agent is detected, an interactive selection menu appears.

${colors.cyan}CI/CD usage:${colors.reset}
  npx hera-agent claude --yes       # No prompt, auto-confirm
  npx hera-agent all --yes          # Install for all, no prompt

${colors.cyan}Version pinning:${colors.reset}
  npx hera-agent claude --version-tag v2.10.0
  npx hera-agent claude --version-tag develop

${colors.cyan}Examples:${colors.reset}
  npx hera-agent claude              Install for Claude Code
  npx hera-agent hermes              Install for Hermes Agent
  npx hera-agent cursor              Install for Cursor
  npx hera-agent all                 Install for all agents
  npx hera-agent uninstall claude    Uninstall from Claude Code
  npx hera-agent list                Show detailed agent info
`);
}

// ============================================================================
// Parse CLI arguments
// ============================================================================

function parseArgs(rawArgs) {
  const parsed = {
    command: null,        // 'install', 'uninstall', 'list', 'graph'
    agent: null,          // specific agent key or 'all'
    yes: false,           // --yes/-y flag
    versionTag: 'main',   // --version-tag value
    help: false,          // --help/-h
    version: false,       // --version/-v
  };

  const args = [...rawArgs];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--version' || arg === '-v') {
      parsed.version = true;
    } else if (arg === '--yes' || arg === '-y') {
      parsed.yes = true;
    } else if (arg === '--version-tag') {
      const val = args[i + 1];
      if (!val || val.startsWith('-')) {
        console.log(`${colors.red}✗ --version-tag requires a value (e.g., --version-tag v2.10.0)${colors.reset}`);
        process.exit(1);
      }
      parsed.versionTag = val;
      i++; // skip next arg
    } else if (arg === 'list') {
      parsed.command = 'list';
    } else if (arg === 'uninstall') {
      parsed.command = 'uninstall';
      const val = args[i + 1];
      if (val && !val.startsWith('-')) {
        parsed.agent = val;
        i++;
      }
    } else if (arg === 'graph') {
      parsed.command = 'graph';
      // Pass remaining args to graph subcommand
      parsed.graphArgs = args.slice(i + 1);
      break;
    } else if (!arg.startsWith('-') && !parsed.command && !parsed.agent) {
      // Positional argument = agent name
      parsed.agent = arg;
      parsed.command = 'install';
    }
  }

  return parsed;
}

// ============================================================================
// Main
//
// CRITICAL FIX: Previous version auto-detected and installed WITHOUT
// asking for confirmation. This caused mismatches when detection picked
// the wrong agent. New flow:
//
//   1. If agent specified explicitly → install for that agent
//   2. If auto-detect finds exactly 1 agent → ask for confirmation
//   3. If auto-detect finds multiple agents → ask user to choose
//   4. If auto-detect finds nothing → show interactive selection
//   5. --yes flag skips confirmation (CI/CD friendly)
//   6. Non-TTY environments auto-use --yes behavior
// ============================================================================

async function main() {
  const agentCount = Object.keys(AGENTS).length;
  console.log(`${colors.blue}`);
  console.log('  ╔═══════════════════════════════════════╗');
  console.log(`  ║  🏛  Hera v${PKG_META.version}                     ║`);
  console.log(`  ║  ${agentCount} AI agents supported${' '.repeat(Math.max(0, 19 - String(agentCount).length))}║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  const parsed = parseArgs(process.argv.slice(2));

  // Apply version tag
  if (parsed.versionTag && parsed.versionTag !== 'main') {
    VERSION_TAG = parsed.versionTag;
    console.log(`${colors.dim}Using version tag: ${VERSION_TAG}${colors.reset}`);
  }

  // --help
  if (parsed.help) {
    showHelp();
    return;
  }

  // --version
  if (parsed.version) {
    console.log(`hera v${PKG_META.version}`);
    return;
  }

  // "list" command
  if (parsed.command === 'list') {
    listAgents();
    return;
  }

  // "graph" subcommand — delegate to hera-graph
  if (parsed.command === 'graph') {
    try {
      execSync(`npx tsx ${path.join(__dirname, '..', 'cli', 'hera-graph.ts')} ${(parsed.graphArgs || []).join(' ')}`, {
        stdio: 'inherit',
      });
    } catch (err) {
      process.exit(1);
    }
    return;
  }

  // "uninstall" command
  if (parsed.command === 'uninstall') {
    if (!parsed.agent) {
      console.log(`${colors.red}✗ Please specify an agent to uninstall.${colors.reset}`);
      console.log(`${colors.cyan}Usage:${colors.reset} npx hera-agent uninstall <agent>`);
      console.log(`${colors.cyan}Example:${colors.reset} npx hera-agent uninstall claude`);
      process.exit(1);
    }
    await uninstallAgent(parsed.agent);
    console.log('');
    console.log(`${colors.green}✓ Uninstall complete!${colors.reset}`);
    console.log('');
    return;
  }

  // Determine if we should skip confirmation
  // --yes flag OR non-TTY environment = skip confirmation
  const skipConfirmation = parsed.yes || !process.stdin.isTTY;

  // Explicit agent specified (install mode)
  if (parsed.agent) {
    const agent = parsed.agent.toLowerCase();

    if (agent === 'all') {
      await installAll();
    } else {
      const success = await installAgent(agent);
      if (!success) {
        process.exit(1);
      }
    }
  } else {
    // Auto-detect
    const detected = detectAgent();

    if (detected.length === 0) {
      // No agents detected — show interactive selection
      console.log(`${colors.yellow}⚠ Could not auto-detect your agent.${colors.reset}`);

      if (skipConfirmation) {
        // In CI/CD mode with no detection, we can't proceed
        console.log(`${colors.red}✗ No agent detected and --yes flag is set (or non-TTY). Please specify an agent explicitly.${colors.reset}`);
        console.log(`${colors.cyan}Example:${colors.reset} npx hera-agent claude --yes`);
        process.exit(1);
      }

      const selected = await interactiveSelect();
      if (selected === 'all') {
        await installAll();
      } else {
        await installAgent(selected);
      }
    } else if (detected.length === 1) {
      // Exactly one agent detected — ask for confirmation
      const d = detected[0];
      console.log(`${colors.blue}ℹ Detected: ${d.name} (score: ${d.score})${colors.reset}`);
      if (d.matchedMarkers.length > 0) {
        console.log(`${colors.dim}  Markers: ${d.matchedMarkers.join(', ')}${colors.reset}`);
      }

      // Ask for confirmation (unless --yes flag or non-TTY)
      if (!skipConfirmation) {
        const answer = await askQuestion(`Install for ${d.name}? (Y/n): `);
        if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
          const selected = await interactiveSelect();
          if (selected === 'all') {
            await installAll();
          } else {
            await installAgent(selected);
          }
          return;
        }
      }

      await installAgent(d.agentKey);
    } else {
      // Multiple agents detected — ask user to choose
      console.log(`${colors.yellow}⚠ Multiple agents detected:${colors.reset}`);
      for (const d of detected) {
        console.log(`  ${colors.bold}${d.name}${colors.reset} (score: ${d.score}, markers: ${d.matchedMarkers.join(', ')})`);
      }
      console.log('');

      if (skipConfirmation) {
        // In CI/CD mode, pick the highest-scored agent automatically
        const best = detected[0];
        console.log(`${colors.blue}ℹ Non-interactive mode: auto-selecting ${best.name} (highest score)${colors.reset}`);
        await installAgent(best.agentKey);
      } else {
        const selected = await interactiveSelect();
        if (selected === 'all') {
          await installAll();
        } else {
          await installAgent(selected);
        }
      }
    }
  }

  console.log('');
  console.log(`${colors.green}✓ Hera installed successfully!${colors.reset}`);
  console.log('');
  console.log(`${colors.cyan}Next steps:${colors.reset}`);
  console.log('  1. Read the architecture: https://github.com/ahmdd4vd/hera');
  console.log('  2. Or: cat SKILL.md (if downloaded)');
  console.log('');
}

main().catch((err) => {
  console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
