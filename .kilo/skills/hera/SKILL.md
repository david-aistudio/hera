# Hera — AI Coding Agent Architecture Reference

## What is Hera?

Hera is a complete architectural reference for building production-grade AI coding agents. Every detail is verified from the [Pi Agent](https://github.com/earendil-works/pi) source code (62K stars).

## How to Use

1. **Read SKILL.md** — The complete architecture reference
2. **Follow the implementation guide** — Step-by-step build order
3. **Use the file reference** — Find any component quickly

## Key Concepts

- **Agent Loop**: Two-loop design (outer: follow-up, inner: tool calls + steering)
- **Agent Class**: Stateful wrapper with queueing (steer, follow-up, next-turn)
- **Agent Harness**: Orchestration layer with session, compaction, hooks
- **Session System**: Tree-based storage with branching
- **Extension System**: Full plugin system with lifecycle hooks
- **AI Layer**: 20+ provider abstraction with streaming

## Rules

- Always read SKILL.md before making architecture decisions
- Follow the critical invariants (section 16.3)
- Avoid the pitfalls (section 17)
