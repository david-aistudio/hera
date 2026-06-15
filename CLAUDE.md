# Hera — AI Coding Agent Architecture Reference

> **For Claude Code**: This file is your project-level guide. Read it first, then dive into SKILL.md for the full reference.

## What is Hera?

Hera is a complete architectural reference for building production-grade AI coding agents. Every detail is verified from 9 open-source codebases with 770K+ combined GitHub stars. It covers the agent loop, tool system, session management, streaming, extensions, and every design pattern you need.

**CRITICAL**: Hera is a SKILL, not a product/framework/competitor. It learns from other agents, it does not compete with them.

## Quick Reference

### Architecture at a Glance

| Component | Description | Key File |
|---|---|---|
| **Agent Loop** | Two-loop design (outer: follow-up, inner: steering + tools) | `references/agent-loop-harness.md` |
| **Agent Class** | Stateful wrapper with message queueing (steer, follow-up, next-turn) | `references/agent-loop-harness.md` |
| **Agent Harness** | Orchestration with session, compaction, hooks | `references/agent-loop-harness.md` |
| **Session System** | Tree-based storage with branching and context compaction | `references/session-and-compaction.md` |
| **Tool System** | 7 built-in tools with validation, parallel execution | `SKILL.md` §9 |
| **Extension System** | Plugin system with lifecycle hooks | `SKILL.md` §10 |
| **AI Provider Layer** | 20+ provider abstraction with streaming and fallback | `references/ai-providers-layer.md` |

### Focused Reference Files

The full SKILL.md is large (~2412 lines). For focused reading, use these extracted references:

| Topic | File | Source |
|---|---|---|
| Agent loop + harness | `references/agent-loop-harness.md` | SKILL.md §3-5 |
| Session + compaction | `references/session-and-compaction.md` | SKILL.md §6-7 |
| AI provider abstraction | `references/ai-providers-layer.md` | SKILL.md §11 |
| Advanced patterns | `references/advanced-patterns.md` | MCP, Skills, Memory, Plugins |
| Multi-provider routing | `references/multi-provider-routing.md` | 9router patterns, OAuth |
| Token optimization | `references/token-optimization.md` | 6 strategies for 60-95% reduction |

### Code Templates (28+ files, copy-paste ready)

**Core** (TypeScript + Python): Agent loop, tool system, session, provider, harness, extension, provider fallback, streaming

**Infrastructure**: Multi-provider router, MCP server/client, TTS/STT/image/embedding providers, web search, tunnel manager, quota tracker, API key validator, updater

**Examples**: Full working agents in `examples/full-agent/` (TypeScript) and `examples/python-agent/` (Python)

## Rules

### Before Editing

1. Read this CLAUDE.md first
2. Check the relevant reference file before making architecture decisions
3. Follow the critical invariants (SKILL.md §16.3)
4. Avoid the pitfalls (SKILL.md §17)

### After Editing

1. Run `npm run test:run` to verify (if applicable)
2. Update this CLAUDE.md if structure changes
3. Validate with `npx hera-agent validate` or `hera validate`

### Key Invariants

- Agent loop must have two loops (outer + inner)
- Context must be immutable (copy before each turn)
- Tool errors become error results, never exceptions
- Session is tree-based, not linear
- `convertToLlm` never throws — use safe fallbacks
- AbortSignal must be respected throughout
- API keys must never be logged

## Implementation Order

For building a new agent from scratch, follow this order (SKILL.md §16):

1. Core types (Message, AgentState, AgentTool, AgentEvent)
2. Agent loop (inner loop: tool calls + steering)
3. Tool system (7 built-in tools with validation)
4. Session system (tree-based with branching)
5. Provider abstraction (streaming + fallback)
6. Agent harness (orchestration + compaction)
7. Extension system (lifecycle hooks)
8. Streaming and event architecture
