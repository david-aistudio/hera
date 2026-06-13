<p align="center">
  <img src="assets/hera-logo.jpg" width="240" alt="Hera">
</p>

<h1 align="center">HERA</h1>

<p align="center">
  The complete architecture reference for building production-grade AI coding agents.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-2.0.0-blue?style=flat-square" alt="Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/agents_studied-18-brightgreen?style=flat-square" alt="Agents Studied"></a>
  <a href="#"><img src="https://img.shields.io/badge/sections-32-purple?style=flat-square" alt="Sections"></a>
  <a href="#"><img src="https://img.shields.io/badge/templates-12-orange?style=flat-square" alt="Templates"></a>
  <a href="#"><img src="https://img.shields.io/badge/patterns-13-red?style=flat-square" alt="Innovation Patterns"></a>
  <a href="#"><img src="https://img.shields.io/badge/languages-TypeScript%20%7C%20Python-blueviolet?style=flat-square" alt="Languages"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#what-makes-hera-different">Why Hera</a> · <a href="#installation">Install</a> · <a href="#architecture">Architecture</a> · <a href="#documentation">Docs</a>
</p>

---

## Quick Start (30 seconds)

```bash
# 1. Clone
git clone https://github.com/david-aistudio/hera.git && cd hera

# 2. Install for your agent
./install.sh claude        # or hermes, opencode, cursor, etc.

# 3. Read the architecture
cat SKILL.md               # 32 sections, 3100+ lines
```

**What you get:**
- Complete architecture reference (verified from 4 production agents)
- 12 code templates — TypeScript + Python (copy-paste ready)
- 15 decision points with justification (which pattern for which situation)
- 15 anti-patterns with real failure examples and solutions
- 13 innovation patterns (how to make agent fast, smart, not stupid)
- Multi-provider system (OpenAI, Anthropic, Google, Ollama, vLLM, any custom)
- Validation checklist (50+ checks)
- Deployment guide (local, Docker, cloud)
- CLI tools (`hera init`, `hera validate`)

---

## What Makes Hera Different

Hera is NOT just a documentation of one agent. It's a synthesis of knowledge from **18 AI coding agents**, deep code study of **4 open-source agents**, and **13 innovation patterns** that go beyond what any single agent does.

### Studied Agents

| Agent | Source | Key Innovation |
|-------|--------|----------------|
| **Pi Agent** | Source code (62K stars) | Two-loop architecture, tree sessions, extensions |
| **Aider** | Source code (30K+ stars) | Edit formats, fuzzy match, architect pattern, linter |
| **OpenCode** | Source code (20K+ stars) | Effect-TS, permission system, plugin architecture |
| **OpenClaw** | Source code (378K stars) | Agent-harness separation, branch compaction |
| **Kilo Code** | Source code (20K+ stars) | Scout mode, reference guidance system |
| **Claude Code** | Behavioral study | Permission levels (auto/confirm/block) |
| **Codex** | Documentation | Container sandboxing |
| **Cursor** | Behavioral study | Context-aware editing |
| **+ 10 more** | Documentation | Various patterns |

### Innovation Patterns (Beyond Any Single Agent)

**How to Make Agent FAST:**
- Streaming (100ms first token)
- Parallel tool execution (5x faster)
- Cache warming (10x cheaper)
- Lazy file loading (read 5 files not 50)

**How to Make Agent SMART with DUMB Models:**
- Edit instructions (SEARCH/REPLACE, not raw code)
- Fuzzy match recovery (recovers from LLM mistakes)
- Architect + Editor (cheap model plans, expensive model edits)
- Linter after edit (catches syntax errors instantly)
- Scout mode (explore codebase before editing)
- Reference guidance (context-aware prompts)

**How to Make Agent NOT STUPID:**
- Self-healing loop (detect stuck, auto-recover)
- Permission system (prevent dangerous operations)
- Branch compaction (remember file ops across compaction)
- Typed errors (specific recovery per error type)
- Auto-commit + rollback (every change reversible)

### The Secret Sauce: Combining Patterns

```
SCOUT + ARCHITECT + EDIT FORMAT + LINTER + GIT + SELF-HEALING

1. Scout explores codebase (Kilo Code pattern)
2. Architect plans changes (Aider pattern, cheap model)
3. Editor applies SEARCH/REPLACE (Aider pattern, expensive model)
4. Linter checks syntax (Aider pattern, instant)
5. Git auto-commits (Aider pattern, reversible)
6. Self-healing recovers from mistakes (innovation pattern)

Result: Agent that's fast, smart with any model, and not stupid.
```

---

## Installation

```bash
git clone https://github.com/david-aistudio/hera.git
cd hera
./install.sh <agent-name>
```

**Supported agents:**

| Agent | Command |
|---|---|
| Claude Code | `./install.sh claude` |
| Hermes | `./install.sh hermes` |
| OpenCode | `./install.sh opencode` |
| Codex | `./install.sh codex` |
| Cursor | `./install.sh cursor` |
| Antigravity | `./install.sh antigravity` |
| Pi | `./install.sh pi` |
| Aider | `./install.sh aider` |
| GitHub Copilot | `./install.sh copilot` |
| Kilo Code | `./install.sh kilo` |
| Kiro | `./install.sh kiro` |
| Devin | `./install.sh devin` |
| Trae | `./install.sh trae` |
| CodeBuddy | `./install.sh codebuddy` |
| OpenClaw | `./install.sh claw` |
| Factory Droid | `./install.sh droid` |
| All agents | `./install.sh all` |

---

## Architecture

The main reference is in **SKILL.md** (3100+ lines, 32 sections):

### Part 1: Fundamentals (from Pi Agent)
| # | Section | Content |
|---|---------|---------|
| 1-6 | Core Architecture | Package structure, types, agent loop, agent class, harness, session |
| 7-9 | Data Flow | Compaction, message conversion, tool system |
| 10-13 | Extensions | Extension system, AI layer, system prompt, skills |
| 14-17 | Patterns | Event architecture, design patterns, implementation guide, pitfalls |

### Part 2: Multi-Agent Knowledge (from 18 agents)
| # | Section | Content |
|---|---------|---------|
| 18 | Multi-Agent Knowledge | 10 patterns from Aider, OpenCode, OpenClaw, Kilo Code, Claude Code |

### Part 3: Decision Framework & Anti-Patterns
| # | Section | Content |
|---|---------|---------|
| 18 | Decision Framework | 15 decision points with conditions, justification, risks, mitigation |
| 18 | Anti-Patterns | 15 patterns with real failure examples, solutions, and code |

### Part 4: Provider System
| # | Section | Content |
|---|---------|---------|
| 11 | Provider System | Multi-provider abstraction, custom endpoints, fallback, routing |

### Part 5: Production Patterns
| # | Section | Content |
|---|---------|---------|
| 26-29 | Security & Testing | Security patterns, error handling, testing patterns |
| 30-31 | Deployment | Deployment guide, GitHub Actions CI/CD |
| 32 | Innovation Patterns | Fast, smart, not stupid — from deep code study |

### Part 6: Code & Tools
| # | Section | Content |
|---|---------|---------|
| 24-25 | Code Templates | 6 TypeScript + 6 Python templates |
| 29 | CLI Tools | `hera init`, `hera validate` |
| 30 | Example Agent | Complete working agent (TypeScript + Python) |

---

## Key Architecture Decisions

**Two-loop agent loop:**
The inner loop handles tool calls and mid-run user messages (steering). The outer loop handles follow-up messages that arrive after the agent would normally stop.

**Tree-based sessions:**
Conversations are stored as a tree, not a linear log. This enables branching — you can fork from any point and explore different paths.

**Built-in compaction:**
When the context window gets too long, old messages are automatically summarized by the LLM. Recent messages are kept intact.

**Multi-provider abstraction:**
Never hardcode to one provider. Support built-in providers (OpenAI, Anthropic, Google), custom providers (Ollama, vLLM, LiteLLM), fallback chains, and task-based routing.

**Edit instructions over raw code:**
LLM outputs SEARCH/REPLACE blocks, not entire files. Works better with weak models. Fuzzy match recovers from mistakes.

---

## Comparison

| Feature | Hera | Pi | Aider | OpenCode | Claude Code |
|---|---|---|---|---|---|
| **Knowledge source** | 18 agents | Self | Self | Self | Self |
| **Edit format** | All (7 types) | Tool calls | SEARCH/REPLACE | Tool calls | Tool calls |
| **Provider support** | Any (custom) | 20+ | Multi | Multi | 1 |
| **Permission system** | Yes | No | No | Yes | Yes |
| **Self-healing** | Yes | No | No | No | No |
| **Scout mode** | Yes | No | No | No | No |
| **Language** | TS + Python | TypeScript | Python | TypeScript | TypeScript |
| **Open source** | Yes (MIT) | Yes | Yes | Yes | No |

---

## File Structure

```
hera/
├── SKILL.md                    Architecture reference (32 sections, 3100+ lines)
├── README.md                   This file
├── AGENTS.md                   Root contract (Hera Framework)
├── HERA_FRAMEWORK.md           Structural framework
├── CLAUDE.md                   Claude Code config
├── CHANGELOG.md                Version history
├── CONTRIBUTING.md             Contribution guide
├── SECURITY.md                 Security patterns
├── ERROR_HANDLING.md           Error handling patterns
├── TESTING.md                  Testing patterns
├── DEPLOYMENT.md               Deployment guide
├── install.sh                  Installation script (18 agents)
├── package.json                npm metadata
├── LICENSE                     MIT License
├── assets/hera-logo.jpg        Logo
├── references/
│   └── innovation-patterns.md  Deep code study patterns
├── docs/
│   ├── PATTERNS.md             Production patterns
│   ├── STREAMING.md            Streaming patterns
│   ├── MEMORY.md               Memory management
│   └── ROUTING.md              Multi-model routing
├── templates/
│   ├── *.ts                    6 TypeScript templates
│   └── python/
│       ├── *.py                6 Python templates
│       └── README.md           Python guide
├── cli/
│   ├── hera-init.ts            CLI: project scaffolding
│   └── hera-validate.ts        CLI: validation
├── examples/
│   ├── full-agent/             TypeScript example (20 files)
│   └── python-agent/           Python example (27 files, 29 tests)
├── .cursor/rules/hera.mdc     Cursor config
├── .agents/rules/hera.md      Antigravity config
├── .kiro/skills/hera/SKILL.md Kiro config
└── .github/actions/validate/  CI/CD validation action
```

---

## Source

Architecture details verified from deep code study of:

| Repository | Stars | Language | Key Patterns |
|---|---|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | 62K | TypeScript | Two-loop, tree sessions, extensions |
| [paul-gauthier/aider](https://github.com/paul-gauthier/aider) | 30K+ | Python | Edit formats, fuzzy match, linter, git |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | 20K+ | TypeScript | Effect-TS, permission, plugins |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | 378K | TypeScript | Agent-harness, compaction, skills |
| [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode) | 20K+ | TypeScript | Scout mode, reference guidance |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/david-aistudio">david-aistudio</a>
</p>
