<p align="center">
  <img src="assets/hera-logo.jpg" width="240" alt="Hera">
</p>

<h1 align="center">HERA</h1>

<p align="center">
  Complete architecture reference for building production-grade AI coding agents.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/agents-18+-brightgreen?style=flat-square" alt="Agents"></a>
</p>

---

## What is Hera?

Hera is a technical reference document that explains how [Pi Agent](https://github.com/earendil-works/pi) works internally. Pi is an open-source TypeScript coding agent with 62K stars on GitHub.

Every section in this document is verified against the actual source code. This is not a tutorial or a blog post — it's a breakdown of a real, production-grade agent architecture.

**Hera Framework** is included — a structural framework based on AGENTS.md hierarchy that keeps any agent project organized and maintainable.

**Use this to:**
- Understand how coding agents work under the hood
- Build your own agent from scratch
- Reference proven patterns for agent design
- Structure your agent project with Hera Framework

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

The main reference is in **SKILL.md** (40KB+, 23 sections):

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
| 11 | AI Layer | Provider abstraction for 20+ LLM providers |
| 12 | System Prompt | How the system prompt is constructed |
| 13 | Skills & Templates | How skills and prompt templates are loaded |
| 14 | Event Architecture | Full event flow from user input to response |
| 15 | Design Patterns | 8 patterns used throughout the codebase |
| 16 | Implementation Guide | Step-by-step order to build your own agent |
| 17 | Pitfalls | 8 mistakes to avoid |
| 18 | File Reference | Source file locations and line counts |
| 19 | Comparison | How Pi differs from Claude Code, Cursor, Codex, etc. |
| 20 | **Architecture Diagrams** | 6 Mermaid diagrams (agent loop, tools, session, events, extensions, packages) |
| 21 | **Validation Checklist** | 11 categories with checkboxes to verify your implementation |
| 22 | Changelog | Version history |
| 23 | Contributing | How to contribute |

---

## Hera Framework

**HERA_FRAMEWORK.md** contains a structural framework for organizing agent projects. It's based on the AGENTS.md hierarchy pattern — a proven approach for keeping large projects maintainable.

Key concepts:
- **AGENTS.md hierarchy**: Root AGENTS.md is the project-wide contract, child AGENTS.md files own specific domains
- **Read Before Editing**: Always read the relevant AGENTS.md chain before making changes
- **Update After Editing**: Update AGENTS.md when changes affect structure, contracts, or workflows
- **Verification**: Check that changes match the established patterns

This framework is what makes the difference between a collection of files and a well-structured project.

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
The same API works for 20+ providers (OpenAI, Anthropic, Google, Bedrock, etc.). Providers register handlers for their API type.

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

## Validation Checklist

SKILL.md includes a validation checklist with 11 categories and 50+ checkboxes. Use it to verify your agent implementation matches the Hera architecture:

- Core Architecture (6 checks)
- Message System (6 checks)
- Tool System (8 checks)
- Session System (6 checks)
- Queue System (5 checks)
- Compaction (5 checks)
- Extension System (5 checks)
- AI Layer (5 checks)
- System Prompt (4 checks)
- Error Handling (5 checks)
- Security (5 checks)

---

## How Pi Agent Works (Summary)

```
User Input
  → AgentHarness.prompt()
    → Create turn state (system prompt, tools, messages)
    → Run agent loop:
        → Stream LLM response
        → If response has tool calls:
            → Execute tools (parallel or sequential)
            → Add results to context
            → Loop back to LLM
        → If no tool calls:
            → Check steering queue (mid-run messages)
            → Check follow-up queue (after-stop messages)
            → If queued messages exist, loop back
            → Otherwise, return response
    → Save messages to session
```

---

## Comparison

| Feature | Pi | Claude Code | OpenCode | Cursor | Codex |
|---|---|---|---|---|---|
| Agent loop | Two-loop (steering + follow-up) | Single loop | Single loop | Single loop | Single loop |
| Session storage | Tree-based with branching | Linear | SQLite | Linear | Linear |
| Compaction | Built-in auto-summarize | Manual | Manual | Manual | Manual |
| Extension system | Full plugin (lifecycle hooks, tools, UI) | Hooks only | Plugins | Rules | Rules |
| LLM providers | 20+ native | 1 (Anthropic) | Multi | Multi | 1 (OpenAI) |
| Mid-run injection | Queue-based steering | Not supported | Not supported | Not supported | Not supported |
| Open source | Yes (MIT) | No | Yes (MIT) | No | No |

---

## File Structure

```
hera/
├── AGENTS.md                   Root contract (Hera Framework)
├── HERA_FRAMEWORK.md           Structural framework
├── SKILL.md                    Architecture reference (19 sections)
├── README.md                   This file
├── CLAUDE.md                   Claude Code config
├── install.sh                  Installation script (18 agents)
├── package.json                npm metadata
├── LICENSE                     MIT License
├── assets/hera-logo.jpg        Logo
├── .cursor/rules/hera.mdc     Cursor config
├── .agents/rules/hera.md      Antigravity config
├── .agents/workflows/hera.md  Antigravity workflow
└── .kiro/skills/hera/SKILL.md Kiro config
```

---

## Source

All architecture details are verified from:
- **Repository**: [earendil-works/pi](https://github.com/earendil-works/pi)
- **Stars**: 62,000+
- **Language**: TypeScript
- **License**: MIT
- **Version analyzed**: v0.79.2

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/david-aistudio">david-aistudio</a>
</p>
