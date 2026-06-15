# Hera — AI Coding Agent Architecture Reference

## What is Hera?

Hera is a complete architectural reference for building production-grade AI coding agents, verified from 9 open-source codebases (770K+ combined GitHub stars).

## Quick Reference

| Component | Description | Reference File |
|---|---|---|
| **Agent Loop** | Two-loop design (outer: follow-up, inner: steering + tools) | `references/agent-loop-harness.md` |
| **Session System** | Tree-based storage with branching and compaction | `references/session-and-compaction.md` |
| **AI Providers** | 20+ provider abstraction with streaming and fallback | `references/ai-providers-layer.md` |

## Rules for Antigravity

- Read SKILL.md before making architecture decisions
- Follow the critical invariants (SKILL.md §16.3)
- Tool errors become error results, never exceptions
- Context must be immutable (copy before each turn)
