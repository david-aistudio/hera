<p align="center">
  <img src="assets/hera-logo.jpg" width="240" alt="Hera">
</p>

<h1 align="center">HERA</h1>

<p align="center">
  The most comprehensive architectural reference for building production-grade AI coding agents. Verified from 9 open-source codebases with 770K+ combined GitHub stars.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-2.6.0-blue?style=flat-square" alt="Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/agents-18+-brightgreen?style=flat-square" alt="Agents"></a>
  <a href="#"><img src="https://img.shields.io/badge/sections-32-purple?style=flat-square" alt="Sections"></a>
  <a href="#"><img src="https://img.shields.io/badge/templates-12-orange?style=flat-square" alt="Templates"></a>
  <a href="#"><img src="https://img.shields.io/badge/references-9-yellow?style=flat-square" alt="References"></a>
  <a href="#"><img src="https://img.shields.io/badge/repos_studied-9-red?style=flat-square" alt="Repos Studied"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#installation">Install</a> · <a href="#architecture">Architecture</a> · <a href="#supported-agents">Agents</a> · <a href="#documentation">Docs</a>
</p>

---

## Quick Start (10 seconds)

```bash
# One command — auto-detects your agent
npx hera-agent

# Or specify agent
npx hera-agent claude
npx hera-agent hermes
npx hera-agent cursor
```

**What you get:**
- Complete architecture reference (verified from 9 codebases, 770K+ combined stars)
- 12 code templates (6 TypeScript + 6 Python, copy-paste ready)
- 2 example agents (TypeScript + Python, full working implementations)
- 9 reference files (advanced patterns, token optimization, ECC patterns, spec-driven dev, innovation patterns, Claude Code architecture, ECC architecture, OpenCode architecture, Kilo Code architecture, Aider architecture)
- Validation checklist (50+ checks)
- Security, error handling, testing patterns
- Deployment guide (local, Docker, cloud)
- CLI tools (`hera init`, `hera validate`)

---

## What is Hera?

Hera is a technical reference document that explains how production-grade AI coding agents work internally. Every detail is verified against actual open-source codebases.

**Repos studied:**

| Repo | Stars | Key Contribution |
|---|---|---|
| [Pi Agent](https://github.com/earendil-works/pi) | 62K | Two-loop agent, tree sessions, extensions, provider abstraction |
| [ECC](https://github.com/affaan-m/ECC) | 211.9K | 64 specialized agents, autonomous loops, self-debugging, hooks |
| [OpenClaw](https://github.com/anthropics/open-claw) | 378K | Agent-harness, branch compaction, context engineering |
| [Aider](https://github.com/paul-gauthier/aider) | 30K+ | Edit formats, fuzzy match, architect mode, git-native patterns |
| [OpenCode](https://github.com/opencode-ai/opencode) | 20K+ | Effect-TS, permission system, plugins, TypeScript errors |
| [Kilo Code](https://github.com/kilo-code/kilo) | 20K+ | Scout mode, reference guidance, task coordination |
| [GSD Core](https://github.com/gsd-core) | Growing | Spec-driven development, multi-agent orchestration |
| [RTK](https://github.com/rtk-framework) | Growing | Token optimization (60-90% reduction) |
| [Headroom](https://github.com/headroom-ai) | Growing | Context compression (60-95% reduction, 6 algorithms) |

**Hera Framework** is included — a structural framework based on AGENTS.md hierarchy that keeps any agent project organized and maintainable.

**Use this to:**
- Understand how coding agents work under the hood
- Build your own agent from scratch
- Reference proven patterns from 9 codebases
- Make informed decisions about agent architecture
- Structure your agent project with Hera Framework

---

## Installation (4 ways)

### Way 1: npx (easiest)

```bash
# Auto-detect your agent
npx hera-agent

# Or specify agent
npx hera-agent claude
npx hera-agent hermes
npx hera-agent cursor

# Install for all agents
npx hera-agent all
```

### Way 2: One-liner

```bash
# Auto-detect your agent
curl -sSL https://raw.githubusercontent.com/david-aistudio/hera/main/install.sh | bash

# Or specify agent
curl -sSL https://raw.githubusercontent.com/david-aistudio/hera/main/install.sh | bash -s -- claude
```

### Way 3: Clone and install

```bash
git clone https://github.com/david-aistudio/hera.git && cd hera
./install.sh claude
```

### Way 4: Manual

Just copy the right file to the right place:
- **Claude Code**: Copy `CLAUDE.md` to your project root
- **Hermes**: Copy `SKILL.md` to `~/.hermes/skills/hera/SKILL.md`
- **Cursor**: Copy `.cursor/rules/hera.mdc` to your project
- **Others**: Copy `AGENTS.md` to your project root

### What the installer does

The installer auto-detects your agent and installs the right config file:

| Agent | File | Location |
|---|---|---|
| Claude Code | `CLAUDE.md` | Project root |
| Hermes | `SKILL.md` | `~/.hermes/skills/hera/` |
| Cursor | `hera.mdc` | `.cursor/rules/` |
| OpenCode | `AGENTS.md` | Project root |
| Kilo Code | `SKILL.md` | `.kilo/skills/hera/` |
| Kiro | `SKILL.md` | `.kiro/skills/hera/` |
| Aider | `AGENTS.md` | Project root |
| Gemini | `GEMINI.md` | Project root |
| Pi | `SKILL.md` | `~/.pi/agent/skills/hera/` |
| Copilot | `SKILL.md` | `~/.copilot/skills/hera/` |
| Devin | `SKILL.md` | `~/.config/devin/skills/hera/` |

**Supported agents (18):**

| Agent | Command |
|---|---|
| Claude Code | `./install.sh claude` |
| Hermes | `./install.sh hermes` |
| OpenCode | `./install.sh opencode` |
| Codex | `./install.sh codex` |
| Cursor | `./install.sh cursor` |
| Antigravity | `./install.sh antigravity` |
| Pi | `./install.sh pi` |
| Gemini CLI | `./install.sh gemini` |
| Aider | `./install.sh aider` |
| GitHub Copilot | `./install.sh copilot` |
| Amp | `./install.sh amp` |
| Kilo Code | `./install.sh kilo` |
| Kiro | `./install.sh kiro` |
| Devin | `./install.sh devin` |
| Trae | `./install.sh trae` |
| CodeBuddy | `./install.sh codebuddy` |
| OpenClaw | `./install.sh claw` |
| Factory Droid | `./install.sh droid` |
| All agents | `./install.sh all` |

---

## What's Covered

### SKILL.md — Main Reference (3282 lines, 32 sections)

| # | Section | Content |
|---|---------|---------|
| 1 | Package Structure | 4 packages and how they depend on each other |
| 2 | Core Types | Message, AgentState, AgentTool, AgentEvent definitions |
| 3 | Agent Loop | The main loop that calls LLM and executes tools |
| 4 | Agent Class | Stateful wrapper with message queueing |
| 5 | Agent Harness | Orchestration layer with session, hooks, compaction |
| 6 | Session System | Tree-based conversation storage with branching |
| 7 | Compaction | Auto-summarize old messages to fit context window |
| 8 | Message Conversion | How custom messages become LLM-compatible messages |
| 9 | Tool System | 7 built-in tools (read, write, edit, bash, grep, find, ls) |
| 10 | Extension System | Plugin system with lifecycle hooks and UI primitives |
| 11 | AI Layer | Provider abstraction, custom providers, fallback chain |
| 12 | System Prompt | How the system prompt is constructed |
| 13 | Skills & Templates | How skills and prompt templates are loaded |
| 14 | Event Architecture | Full event flow from user input to response |
| 15 | Design Patterns | 8 patterns used throughout the codebase |
| 16 | Implementation Guide | Step-by-step order to build your own agent |
| 17 | Pitfalls | 8 mistakes to avoid |
| 18 | Multi-Agent Knowledge | 10 patterns, 15 decision points, 15 anti-patterns from 18 agents |
| 19 | Innovation Patterns | FAST (streaming/parallel/cache/lazy), SMART (edit-instructions/fuzzy/architect/linter/scout), NOT STUPID (self-healing/permissions/compaction/errors/auto-commit) |
| 20 | Architecture Diagrams | 6 Mermaid diagrams (agent loop, tools, session, events, extensions, packages) |
| 21 | Validation Checklist | 11 categories with 50+ checkboxes |
| 22 | Code Templates | 6 TypeScript + 6 Python templates |
| 23 | Security Patterns | Tool sandboxing, permissions, input/output sanitization |
| 24 | Error Handling | Retry, graceful degradation, error propagation |
| 25 | Testing Patterns | Unit, integration, E2E tests with mocks and fixtures |
| 26 | CLI Tools | `hera init` (scaffold) and `hera validate` (verify) |
| 27 | Example Agent | Complete working agent (TypeScript + Python) |
| 28 | Deployment | Local, Docker, cloud deployment with monitoring |
| 29 | GitHub Actions | CI/CD integration for automated validation |
| 30 | Production Patterns | Task routing, streaming, memory management, context engineering |
| 31 | Spec-Driven Development | Pipeline from spec to code with multi-agent orchestration |
| 32 | Token Optimization | 6 strategies for 60-95% token reduction |

### Reference Files (9 files, 54,288 lines)

| File | Lines | Content |
|---|---|---|
| `references/advanced-patterns.md` | 911 | 8 production features: MCP, Skills, Memory, Plugins, Cost Tracking, Observability, Hooks, Multi-Modal |
| `references/claude-code-architecture.md` | 14,279 | Claude Code (OpenClaude) deep analysis: query loop (2240 lines), 50+ tools, 7 permission modes, hook system, streaming tool execution, subagent system |
| `references/ecc-architecture.md` | 8,990 | ECC plugin deep analysis: 64 specialized agents, 17 hooks, rules per language, 262 skills, continuous learning |
| `references/opencode-architecture.md` | 8,291 | OpenCode Go agent deep analysis: agent loop (758 lines), 11 providers, 10 tools, permission system, cost tracking |
| `references/kilocode-architecture.md` | 5,417 | Kilo Code monorepo deep analysis: Agent Manager, auto-generated SDK, gateway pattern, worktree isolation |
| `references/aider-architecture.md` | 15,320 | Aider deep analysis: 6 edit formats, architect mode (48 lines!), repo map (tree-sitter + PageRank), fuzzy match, reflection loop, linter integration |
| `references/ecc-patterns.md` | 400 | From ECC: agent harness construction, autonomous loops, self-debugging, hooks, benchmarking |
| `references/token-optimization.md` | 479 | From RTK + Headroom: 6 compression strategies (command, diff, search, log, live zone, adaptive) |
| `references/spec-driven-development.md` | 132 | From GSD Core: spec pipeline, multi-agent orchestration, context engineering, state management |
| `references/innovation-patterns.md` | 69 | From all repos: fast (streaming/parallel/cache/lazy), smart (edit-instructions/fuzzy/architect/linter/scout), not stupid (self-healing/permissions/compaction/errors/auto-commit) |

### Docs (4 files, 2380 lines)

| File | Lines | Content |
|---|---|---|
| `docs/PATTERNS.md` | ~600 | Task routing, error recovery, streaming patterns |
| `docs/STREAMING.md` | ~500 | Streaming implementation, backpressure, buffering |
| `docs/MEMORY.md` | ~600 | Memory management, context window, summarization |
| `docs/ROUTING.md` | ~680 | Provider routing, fallback, load balancing |

### Templates (12 files)

- **TypeScript** (6): Agent loop, tool system, session, provider, harness, extension
- **Python** (6): Agent loop, tool system, session, provider, harness, extension

### Examples (2 agents)

- **TypeScript** (`examples/full-agent/`): Complete agent with tools, session, provider, tests
- **Python** (`examples/python-agent/`): Complete agent with 29 tests passing, multi-provider, CLI

---

## Hera Framework

**HERA_FRAMEWORK.md** (663 lines) contains:

- **5 Project Templates**: coding-agent, web-app, library, api-server, monorepo
- **3 Real Examples**: Pi Agent, OpenClaw, Aider architecture breakdowns
- **8 Agent-Specific Guidance**: Claude Code, OpenCode, Cursor, Kilo Code, OpenClaw, Hermes, Pi, Copilot
- **16 Validation Checks**: Structure, naming, hierarchy, consistency
- **6 Anti-Patterns**: Common mistakes with examples and fixes

---

## Key Architecture Decisions

**Two-loop agent loop:**
The inner loop handles tool calls and mid-run user messages (steering). The outer loop handles follow-up messages that arrive after the agent would normally stop.

**Tree-based sessions:**
Conversations are stored as a tree, not a linear log. This enables branching — you can fork from any point and explore different paths.

**Built-in compaction:**
When the context window gets too long, old messages are automatically summarized by the LLM. Recent messages are kept intact.

**Queue-based steering:**
Users can inject messages while the agent is running without interrupting it. Three queue types: steer (mid-run), follow-up (after stop), and next-turn (prepend to next turn).

**Provider abstraction:**
The same API works for 20+ providers (OpenAI, Anthropic, Google, Bedrock, etc.). Providers register handlers for their API type. Fallback chains ensure reliability.

**Autonomous loops (from ECC):**
Six loop patterns: sequential, infinite, PR loop, de-sloppify, multi-agent DAG, RFC-driven. Agents can self-debug and recover from failures.

**Token optimization (from RTK + Headroom):**
Six compression strategies: command output, diff/search/log compression, live zone detection, adaptive compression. 60-95% token reduction.

---

## Architecture Diagrams

SKILL.md includes 6 Mermaid diagrams that render on GitHub:

1. **Agent Loop** — Two-loop design (outer: follow-up, inner: steering + tools)
2. **Tool Execution Flow** — How tools are prepared, validated, and executed
3. **Session Tree Structure** — How conversations branch and compact
4. **Event Flow Sequence** — Complete event lifecycle from user input to response
5. **Extension System** — How extensions register tools, commands, and event handlers
6. **Package Dependencies** — How the 4 packages depend on each other

---

## File Structure

```
hera/
├── AGENTS.md                       Root contract (Hera Framework)
├── HERA_FRAMEWORK.md               Structural framework (663 lines)
├── SKILL.md                        Architecture reference (3282 lines, 32 sections)
├── README.md                       This file
├── CHANGELOG.md                    Version history
├── CONTRIBUTING.md                 How to contribute
├── CLAUDE.md                       Claude Code config
├── DEPLOYMENT.md                   Deployment guide
├── ERROR_HANDLING.md               Error handling patterns
├── SECURITY.md                     Security patterns
├── TESTING.md                      Testing patterns
├── install.sh                      Installation script (18 agents)
├── package.json                    npm metadata
├── LICENSE                         MIT License
├── assets/hera-logo.jpg            Logo
├── references/
│   ├── advanced-patterns.md        8 production features (911 lines)
│   ├── claude-code-architecture.md Claude Code deep analysis (14,279 lines)
│   ├── ecc-architecture.md         ECC deep analysis (8,990 lines)
│   ├── opencode-architecture.md    OpenCode deep analysis (8,291 lines)
│   ├── kilocode-architecture.md    Kilo Code deep analysis (5,417 lines)
│   ├── aider-architecture.md       Aider deep analysis (15,320 lines)
│   ├── ecc-patterns.md             ECC patterns (400 lines)
│   ├── token-optimization.md       Token optimization (479 lines)
│   ├── spec-driven-development.md  Spec-driven dev (132 lines)
│   └── innovation-patterns.md      Innovation patterns (69 lines)
├── templates/
│   ├── TypeScript (6 files)        Agent loop, tools, session, provider, harness, extension
│   └── Python (6 files)            Agent loop, tools, session, provider, harness, extension
├── examples/
│   ├── full-agent/                 TypeScript example agent
│   └── python-agent/               Python example agent (29 tests)
├── docs/
│   ├── PATTERNS.md                 Production patterns
│   ├── STREAMING.md                Streaming patterns
│   ├── MEMORY.md                   Memory management
│   └── ROUTING.md                  Provider routing
├── cli/
│   ├── hera-init.ts                Scaffold CLI
│   └── hera-validate.ts            Validation CLI
├── .github/actions/validate/       GitHub Action
├── .cursor/rules/hera.mdc         Cursor config
├── .agents/rules/hera.md          Antigravity config
├── .agents/workflows/hera.md      Antigravity workflow
└── .kiro/skills/hera/SKILL.md     Kiro config
```

---

## Stats

| Metric | Value |
|---|---|
| SKILL.md | 3282 lines, 32 sections |
| Reference files | 9 files, 54,288 lines |
| Total content | 65,000+ lines |
| Templates | 12 (6 TS + 6 Python) |
| Example agents | 2 (TypeScript + Python) |
| Repos studied | 9 (770K+ combined stars) |
| Deep studies | 6 repos (Pi, Claude Code, ECC, OpenCode, Kilo Code, Aider) |
| Agents supported | 18 |
| Python tests | 29 passing |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/david-aistudio">david-aistudio</a>
</p>
