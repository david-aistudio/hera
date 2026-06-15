#!/usr/bin/env node
/**
 * hera init — Scaffold a new AI coding agent project
 *
 * Usage: hera init [project-name]
 *
 * Creates a new project with:
 * - Agent loop, tools, session, provider, harness, extension
 * - Test suite (unit, integration, E2E)
 * - AGENTS.md with Hera Framework
 * - package.json, tsconfig.json, vitest.config.ts
 * - .env.example with required variables
 *
 * Interactive mode: Prompts for project name, description, provider, and features.
 * Non-interactive: Accepts --name, --desc, --provider flags or uses defaults.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ============================================================================
// Config
// ============================================================================

interface ProjectConfig {
  name: string;
  description: string;
  provider: "openai" | "anthropic" | "custom";
  tools: string[];
  features: {
    session: boolean;
    compaction: boolean;
    extensions: boolean;
    security: boolean;
  };
}

type PartialConfig = Partial<Omit<ProjectConfig, "features">> & {
  features?: Partial<ProjectConfig["features"]>;
};

const DEFAULT_CONFIG: ProjectConfig = {
  name: "my-agent",
  description: "AI coding agent built with Hera Framework",
  provider: "openai",
  tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
  features: {
    session: true,
    compaction: true,
    extensions: true,
    security: true,
  },
};

// ============================================================================
// Interactive Prompts (readline-based)
// ============================================================================

function createPrompter(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, prompt: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`${prompt}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function questionYesNo(rl: readline.Interface, prompt: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]" : " [y/N]";
  return new Promise((resolve) => {
    rl.question(`${prompt}${suffix}: `, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") resolve(defaultValue);
      else resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

function questionChoice<T extends string>(
  rl: readline.Interface,
  prompt: string,
  choices: T[],
  defaultValue: T
): Promise<T> {
  const options = choices.map((c) => (c === defaultValue ? `${c} (default)` : c)).join(" / ");
  return new Promise((resolve) => {
    rl.question(`${prompt} [${options}]: `, (answer) => {
      const trimmed = answer.trim().toLowerCase() as T;
      if (choices.includes(trimmed)) resolve(trimmed);
      else resolve(defaultValue);
    });
  });
}

async function promptUser(overrides?: PartialConfig): Promise<ProjectConfig> {
  // Merge features properly: spread default features, then overlay partial overrides
  const config: ProjectConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    features: {
      ...DEFAULT_CONFIG.features,
      ...overrides?.features,
    },
  };

  // If all values provided via CLI flags, skip interactive prompts
  const hasAllFlags = overrides?.name && overrides?.description && overrides?.provider;
  if (hasAllFlags) return config;

  // Check if stdin is a TTY (interactive terminal)
  const isInteractive = process.stdin.isTTY;

  if (!isInteractive) {
    // Non-interactive mode: use defaults or CLI args
    const args = process.argv.slice(2);
    for (const arg of args) {
      if (!arg.startsWith("-")) {
        config.name = arg;
        break;
      }
    }
    console.log("Non-interactive mode detected. Using defaults.");
    console.log(`  Project name: ${config.name}`);
    console.log(`  Description: ${config.description}`);
    console.log(`  Provider: ${config.provider}`);
    return config;
  }

  // Interactive mode
  const rl = createPrompter();

  try {
    console.log("🏗  Let's set up your AI coding agent project!\n");

    config.name = await question(rl, "Project name", config.name);
    config.description = await question(rl, "Description", config.description);
    config.provider = await questionChoice(
      rl,
      "LLM Provider",
      ["openai", "anthropic", "custom"] as const,
      config.provider
    );

    console.log("\nFeatures:");
    config.features.session = await questionYesNo(
      rl,
      "  Enable tree-based sessions?",
      config.features.session
    );
    config.features.compaction = await questionYesNo(
      rl,
      "  Enable context compaction?",
      config.features.compaction
    );
    config.features.extensions = await questionYesNo(
      rl,
      "  Enable extension system?",
      config.features.extensions
    );
    config.features.security = await questionYesNo(
      rl,
      "  Enable security sandboxing?",
      config.features.security
    );

    console.log("");
  } finally {
    rl.close();
  }

  return config;
}

// ============================================================================
// File Templates
// ============================================================================

const TEMPLATES: Record<string, (config: ProjectConfig) => string> = {
  "package.json": (config) => `{
  "name": "${config.name}",
  "version": "0.1.0",
  "description": "${config.description}",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0"
  },
  "license": "MIT"
}`,

  "tsconfig.json": () => `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}`,

  "vitest.config.ts": () => `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "tests"],
    },
  },
});
`,

  ".env.example": (config) => `# LLM Provider API Keys
${config.provider === "openai" ? "OPENAI_API_KEY=sk-..." : "ANTHROPIC_API_KEY=sk-ant-..."}

# Optional: Custom base URL
# LLM_BASE_URL=https://api.openai.com/v1

# Optional: Default model
# LLM_MODEL=${config.provider === "openai" ? "gpt-4" : "claude-sonnet-4-20250514"}

# Optional: Log level
# LOG_LEVEL=info
`,

  "AGENTS.md": (config) => `# ${config.name}

## Purpose

${config.description}

## Ownership

- **Root**: This AGENTS.md — project-wide rules
- **src/agent/**: Agent loop and agent class
- **src/tools/**: Tool implementations
- **src/session/**: Session storage and management
- **src/extensions/**: Extension system
- **src/providers/**: LLM provider implementations

## Local Contracts

### Hera Framework

This project uses the Hera Framework. All edits must follow the Read Before Editing and Update After Editing rules.

### Tools

Available tools: ${config.tools.join(", ")}

### Features

- Session: ${config.features.session ? "enabled" : "disabled"}
- Compaction: ${config.features.compaction ? "enabled" : "disabled"}
- Extensions: ${config.features.extensions ? "enabled" : "disabled"}
- Security: ${config.features.security ? "enabled" : "disabled"}

## Work Guidance

### Before Editing

1. Read this AGENTS.md
2. Read the relevant source files
3. Check tests for expected behavior

### After Editing

1. Run \`npm run test:run\` to verify
2. Update this AGENTS.md if structure changes

## Verification

- \`npm run test:run\` — Run all tests
- \`npm run typecheck\` — Type checking
- \`npm run lint\` — Linting
`,

  ".gitignore": () => `node_modules/
dist/
.env
*.log
.DS_Store
coverage/
__pycache__/
`,

  "README.md": (config) => `# ${config.name}

${config.description}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run the agent
npm run dev

# Run tests
npm test
\`\`\`

## Project Structure

\`\`\`
src/
├── agent/          ← Agent loop and agent class
├── tools/          ← Tool implementations
├── session/        ← Session storage
├── extensions/     ← Extension system
├── providers/      ← LLM providers
└── index.ts        ← Entry point
tests/
├── unit/           ← Unit tests
├── integration/    ← Integration tests
└── e2e/            ← End-to-end tests
\`\`\`

## Built with

- [Hera Framework](https://github.com/ahmdd4vd/hera) — Architecture reference
- TypeScript
- Vitest
`,

  "src/index.ts": (config) => `/**
 * ${config.name} — Entry point
 *
 * ${config.description}
 */

import { createAgent } from "./agent/index.js";
import { createTools } from "./tools/index.js";
import { createSession } from "./session/index.js";
import { createProvider } from "./providers/index.js";

async function main() {
  // Create provider
  const provider = createProvider();

  // Create tools
  const tools = createTools(process.cwd());

  // Create session
  const session = createSession();

  // Create agent
  const agent = createAgent({
    provider,
    tools,
    session,
    systemPrompt: "You are a helpful coding assistant.",
  });

  // Run agent
  const response = await agent.prompt("Hello! What can you help me with?");
  console.log("Agent:", response);
}

main().catch(console.error);
`,
};

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseCliArgs(): PartialConfig {
  const args = process.argv.slice(2);
  const overrides: PartialConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--name":
      case "-n":
        overrides.name = args[++i];
        break;
      case "--desc":
      case "-d":
        overrides.description = args[++i];
        break;
      case "--provider":
      case "-p":
        overrides.provider = args[++i] as "openai" | "anthropic" | "custom";
        break;
      case "--no-session":
        overrides.features = { ...(overrides.features ?? {}), session: false };
        break;
      case "--no-compaction":
        overrides.features = { ...(overrides.features ?? {}), compaction: false };
        break;
      case "--no-extensions":
        overrides.features = { ...(overrides.features ?? {}), extensions: false };
        break;
      case "--no-security":
        overrides.features = { ...(overrides.features ?? {}), security: false };
        break;
      case "--help":
      case "-h":
        console.log(`
${"\x1b[1m"}hera init — Scaffold a new AI coding agent project${"\x1b[0m"}

Usage:
  hera init [project-name]             Interactive mode
  hera init --name my-agent            Specify project name
  hera init -n my-agent -p openai      Non-interactive with flags

Options:
  -n, --name <name>          Project name
  -d, --desc <description>   Project description
  -p, --provider <provider>  LLM provider (openai | anthropic | custom)
  --no-session               Disable session system
  --no-compaction            Disable context compaction
  --no-extensions            Disable extension system
  --no-security              Disable security sandboxing
  -h, --help                 Show this help

Examples:
  hera init
  hera init my-agent
  hera init --name my-agent --provider anthropic
  hera init -n agent -d "My AI agent" -p openai --no-extensions
`);
        process.exit(0);
        break;
      default:
        // Positional argument = project name
        if (!arg.startsWith("-") && !overrides.name) {
          overrides.name = arg;
        }
        break;
    }
  }

  return overrides;
}

// ============================================================================
// Project Generator
// ============================================================================

async function generateProject(config: ProjectConfig): Promise<void> {
  const projectDir = path.resolve(process.cwd(), config.name);

  // Create directory
  if (fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${config.name}" already exists`);
    process.exit(1);
  }

  fs.mkdirSync(projectDir, { recursive: true });

  // Generate files from templates
  for (const [filePath, template] of Object.entries(TEMPLATES)) {
    const fullPath = path.join(projectDir, filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, template(config));
  }

  // Copy minimal-*.ts templates from hera repo (skip python/, non-minimal files)
  const templateDir = path.resolve(__dirname, "..", "templates");
  if (fs.existsSync(templateDir)) {
    const templates = fs.readdirSync(templateDir);
    for (const template of templates) {
      // Only copy minimal-*.ts files, skip python/ directory and non-minimal templates
      if (!template.startsWith("minimal-") || !template.endsWith(".ts")) continue;
      const src = path.join(templateDir, template);
      // Skip directories (shouldn't happen with .ts filter, but be safe)
      if (!fs.statSync(src).isFile()) continue;
      const dest = path.join(projectDir, "src", template.replace("minimal-", ""));
      fs.copyFileSync(src, dest);
    }
  }

  console.log(`
✅ Project "${config.name}" created successfully!

Configuration:
  Provider: ${config.provider}
  Session: ${config.features.session ? "enabled" : "disabled"}
  Compaction: ${config.features.compaction ? "enabled" : "disabled"}
  Extensions: ${config.features.extensions ? "enabled" : "disabled"}
  Security: ${config.features.security ? "enabled" : "disabled"}

Next steps:
  cd ${config.name}
  npm install
  cp .env.example .env
  # Edit .env with your API keys
  npm run dev

For more information, see README.md
`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🏗  Hera Init — Scaffold a new AI coding agent project\n");

  const cliOverrides = parseCliArgs();
  const config = await promptUser(cliOverrides);
  await generateProject(config);
}

main().catch(console.error);
