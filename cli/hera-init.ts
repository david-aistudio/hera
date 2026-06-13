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
 */

import * as fs from "fs";
import * as path from "path";

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

- [Hera Framework](https://github.com/david-aistudio/hera) — Architecture reference
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
// Interactive Prompts
// ============================================================================

async function promptUser(): Promise<ProjectConfig> {
  // In production, use readline or inquirer
  // For this example, use defaults
  const config = { ...DEFAULT_CONFIG };

  // Check for command line arguments
  const args = process.argv.slice(2);
  if (args.length > 0) {
    config.name = args[0];
  }

  return config;
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

  // Copy templates from hera repo
  const templateDir = path.resolve(__dirname, "..", "templates");
  if (fs.existsSync(templateDir)) {
    const templates = fs.readdirSync(templateDir);
    for (const template of templates) {
      const src = path.join(templateDir, template);
      const dest = path.join(projectDir, "src", template.replace("minimal-", ""));
      fs.copyFileSync(src, dest);
    }
  }

  console.log(`
✅ Project "${config.name}" created successfully!

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

  const config = await promptUser();
  await generateProject(config);
}

main().catch(console.error);
