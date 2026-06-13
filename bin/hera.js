#!/usr/bin/env node

/**
 * Hera — AI Coding Agent Architecture Reference
 * CLI installer for 18+ AI coding agents
 *
 * Usage:
 *   npx hera-agent              # Auto-detect and install
 *   npx hera-agent claude       # Install for Claude Code
 *   npx hera-agent hermes       # Install for Hermes Agent
 *   npx hera-agent cursor       # Install for Cursor
 *   npx hera-agent all          # Install for all agents
 *   npx hera-agent --help       # Show help
 *
 * Subcommands (built-in):
 *   npx hera-agent graph <cmd>  # Visualize graphify knowledge graph
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const GITHUB_RAW = 'https://raw.githubusercontent.com/david-aistudio/hera/main';

// Subcommand dispatch (graph, etc.)
const SUBCOMMANDS = ['graph'];

// Read version + metadata from package.json dynamically
// (avoids the "version drift" bug where the banner falls behind reality)
let PKG_META = { version: '?', description: '' };
try {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  PKG_META = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
} catch (err) {
  // Fall back to hardcoded values if package.json can't be read
  PKG_META = { version: '2.7.3', description: 'Hera — AI Coding Agent Architecture Reference' };
}

// Supported agents and their install configs
const AGENTS = {
  claude: {
    name: 'Claude Code',
    files: [{ src: 'CLAUDE.md', dest: 'CLAUDE.md', type: 'file' }],
  },
  hermes: {
    name: 'Hermes Agent',
    files: [{ src: 'SKILL.md', dest: '~/.hermes/skills/hera/SKILL.md', type: 'home' }],
  },
  cursor: {
    name: 'Cursor',
    files: [{ src: '.cursor/rules/hera.mdc', dest: '.cursor/rules/hera.mdc', type: 'dir' }],
  },
  opencode: {
    name: 'OpenCode',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  codex: {
    name: 'Codex',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  kilo: {
    name: 'Kilo Code',
    files: [{ src: 'SKILL.md', dest: '.kilo/skills/hera/SKILL.md', type: 'dir' }],
  },
  kiro: {
    name: 'Kiro',
    files: [{ src: 'SKILL.md', dest: '.kiro/skills/hera/SKILL.md', type: 'dir' }],
  },
  aider: {
    name: 'Aider',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  gemini: {
    name: 'Gemini CLI',
    files: [{ src: 'AGENTS.md', dest: 'GEMINI.md', type: 'file' }],
  },
  pi: {
    name: 'Pi coding agent',
    files: [{ src: 'SKILL.md', dest: '~/.pi/agent/skills/hera/SKILL.md', type: 'home' }],
  },
  copilot: {
    name: 'GitHub Copilot CLI',
    files: [{ src: 'SKILL.md', dest: '~/.copilot/skills/hera/SKILL.md', type: 'home' }],
  },
  devin: {
    name: 'Devin CLI',
    files: [{ src: 'SKILL.md', dest: '~/.config/devin/skills/hera/SKILL.md', type: 'home' }],
  },
  antigravity: {
    name: 'Google Antigravity',
    files: [
      { src: '.agents/rules/hera.md', dest: '.agents/rules/hera.md', type: 'dir' },
      { src: '.agents/workflows/hera.md', dest: '.agents/workflows/hera.md', type: 'dir' },
    ],
  },
  codebuddy: {
    name: 'CodeBuddy',
    files: [{ src: 'AGENTS.md', dest: 'CODEBUDDY.md', type: 'file' }],
  },
  amp: {
    name: 'Amp',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  trae: {
    name: 'Trae',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  claw: {
    name: 'OpenClaw',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
  droid: {
    name: 'Factory Droid',
    files: [{ src: 'AGENTS.md', dest: 'AGENTS.md', type: 'file' }],
  },
};

// Auto-detect agent
function detectAgent() {
  const cwd = process.cwd();
  const home = require('os').homedir();

  // Claude Code
  if (
    fs.existsSync(path.join(cwd, 'CLAUDE.md')) ||
    fs.existsSync(path.join(cwd, '.claude')) ||
    isCommandAvailable('claude')
  ) {
    return 'claude';
  }

  // Hermes Agent
  if (
    fs.existsSync(path.join(home, '.hermes')) ||
    fs.existsSync(path.join(home, '.hermes', 'config.yaml'))
  ) {
    return 'hermes';
  }

  // Cursor
  if (
    fs.existsSync(path.join(cwd, '.cursor')) ||
    fs.existsSync(path.join(cwd, '.cursorrules'))
  ) {
    return 'cursor';
  }

  // OpenCode
  if (
    fs.existsSync(path.join(cwd, 'opencode.json')) ||
    fs.existsSync(path.join(cwd, '.opencode'))
  ) {
    return 'opencode';
  }

  // Kilo Code
  if (fs.existsSync(path.join(cwd, '.kilo'))) {
    return 'kilo';
  }

  // Kiro
  if (fs.existsSync(path.join(cwd, '.kiro'))) {
    return 'kiro';
  }

  // Aider
  if (
    fs.existsSync(path.join(cwd, '.aider.conf.yml')) ||
    fs.existsSync(path.join(cwd, '.aider'))
  ) {
    return 'aider';
  }

  // Gemini
  if (
    fs.existsSync(path.join(cwd, 'GEMINI.md')) ||
    fs.existsSync(path.join(cwd, '.gemini'))
  ) {
    return 'gemini';
  }

  // Pi
  if (fs.existsSync(path.join(home, '.pi'))) {
    return 'pi';
  }

  return null;
}

function isCommandAvailable(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Download file from GitHub
function downloadFile(filePath) {
  return new Promise((resolve, reject) => {
    const url = `${GITHUB_RAW}/${filePath}`;
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          https.get(res.headers.location, (res2) => {
            let data = '';
            res2.on('data', (chunk) => (data += chunk));
            res2.on('end', () => resolve(data));
          }).on('error', reject);
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

// Expand ~ to home directory
function expandHome(filepath) {
  if (filepath.startsWith('~')) {
    return path.join(require('os').homedir(), filepath.slice(1));
  }
  return filepath;
}

// Install for a specific agent
async function installAgent(agentKey) {
  const agent = AGENTS[agentKey];
  if (!agent) {
    console.log(`${colors.red}✗ Unknown agent: ${agentKey}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}ℹ Installing for ${agent.name}...${colors.reset}`);

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
      if (existing.includes('Hera')) {
        console.log(`${colors.yellow}⚠ ${file.dest} already contains Hera${colors.reset}`);
        continue;
      }
    }

    // Download and write file
    try {
      const content = await downloadFile(file.src);
      fs.writeFileSync(destPath, content, 'utf8');
      console.log(`${colors.green}✓ Created ${file.dest}${colors.reset}`);
    } catch (err) {
      console.log(`${colors.red}✗ Failed to download ${file.src}: ${err.message}${colors.reset}`);
    }
  }
}

// Install for all agents
async function installAll() {
  console.log(`${colors.blue}ℹ Installing for all agents...${colors.reset}`);
  for (const agentKey of Object.keys(AGENTS)) {
    try {
      await installAgent(agentKey);
    } catch (err) {
      // Skip errors for agents that don't apply
    }
  }
  console.log(`${colors.green}✓ Installed for all agents!${colors.reset}`);
}

// Show help
function showHelp() {
  console.log(`
${colors.bold}Hera — AI Coding Agent Architecture Reference${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx hera-agent                    Auto-detect and install
  npx hera-agent <agent>            Install for specific agent
  npx hera-agent all                Install for all agents
  npx hera-agent --help             Show this help

${colors.cyan}Supported agents:${colors.reset}
  claude        Claude Code
  hermes        Hermes Agent
  cursor        Cursor
  opencode      OpenCode
  codex         Codex
  kilo          Kilo Code
  kiro          Kiro
  aider         Aider
  gemini        Gemini CLI
  pi            Pi coding agent
  copilot       GitHub Copilot CLI
  devin         Devin CLI
  antigravity   Google Antigravity
  codebuddy     CodeBuddy
  amp           Amp
  trae          Trae
  claw          OpenClaw
  droid         Factory Droid
  all           All agents

${colors.cyan}Examples:${colors.reset}
  npx hera-agent claude
  npx hera-agent hermes
  npx hera-agent cursor
  npx hera-agent all
`);
}

// Main
async function main() {
  const agentCount = Object.keys(AGENTS).length;
  console.log(`${colors.blue}`);
  console.log('  ╔═══════════════════════════════════════╗');
  console.log(`  ║  🏛  Hera v${PKG_META.version}                     ║`);
  console.log(`  ║  ${agentCount} AI agents supported${' '.repeat(Math.max(0, 19 - String(agentCount).length))}║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  const args = process.argv.slice(2);

  // Check for subcommand dispatch FIRST (so `graph --help` works)
  if (args[0] === 'graph') {
    // Delegate to hera-graph subcommand
    try {
      execSync(`npx tsx ${path.join(__dirname, '..', 'cli', 'hera-graph.ts')} ${args.slice(1).join(' ')}`, {
        stdio: 'inherit',
      });
    } catch (err) {
      process.exit(1);
    }
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.length > 0) {
    const agent = args[0].toLowerCase();

    if (agent === 'all') {
      await installAll();
    } else {
      await installAgent(agent);
    }
  } else {
    // Auto-detect
    const detected = detectAgent();

    if (detected) {
      console.log(`${colors.blue}ℹ Detected: ${AGENTS[detected].name}${colors.reset}`);
      await installAgent(detected);
    } else {
      console.log(`${colors.yellow}⚠ Could not auto-detect your agent.${colors.reset}`);
      console.log(`${colors.cyan}Please specify:${colors.reset} npx hera-agent <agent>`);
      console.log(`${colors.cyan}Run${colors.reset} npx hera-agent --help ${colors.cyan}for list of agents.${colors.reset}`);
    }
  }

  console.log('');
  console.log(`${colors.green}✓ Hera installed successfully!${colors.reset}`);
  console.log('');
  console.log(`${colors.cyan}Next steps:${colors.reset}`);
  console.log('  1. Read the architecture: https://github.com/david-aistudio/hera');
  console.log('  2. Or: cat SKILL.md (if downloaded)');
  console.log('');
}

main().catch((err) => {
  console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
