# Hera — AI Coding Agent Architecture Reference

## Purpose

Hera is a complete architectural reference for building production-grade AI coding agents. Every detail is verified from the Pi Agent source code (62K stars, TypeScript monorepo).

## Ownership

- **Root**: This AGENTS.md — project-wide rules, Hera Framework integration
- **SKILL.md**: Main architecture reference (19 sections, 37KB)
- **HERA_FRAMEWORK.md**: Structural framework for agent projects
- **install.sh**: Installation script for 18 AI agents

## Local Contracts

### Hera Framework

This project uses the Hera Framework (see HERA_FRAMEWORK.md). All edits must follow the framework's Read Before Editing and Update After Editing rules.

### File Structure

```
hera/
├── AGENTS.md                   ← This file (root contract)
├── HERA_FRAMEWORK.md           ← Structural framework
├── SKILL.md                    ← Architecture reference
├── README.md                   ← GitHub documentation
├── CLAUDE.md                   ← Claude Code config
├── install.sh                  ← Installation script
├── assets/hera-logo.jpg        ← Logo
├── .cursor/rules/hera.mdc     ← Cursor config
├── .agents/rules/hera.md      ← Antigravity config
├── .agents/workflows/hera.md  ← Antigravity workflow
└── .kiro/skills/hera/SKILL.md ← Kiro config
```

### Reference Files (18 files, ~76K lines)

`references/advanced-patterns.md`, `references/claude-code-architecture.md`,
`references/ecc-architecture.md`, `references/opencode-architecture.md`,
`references/kilocode-architecture.md`, `references/aider-architecture.md`,
**`references/hermes-architecture.md`** (Hermes Agent — added 2026-06-13),
`references/ecc-patterns.md`, `references/token-optimization.md`,
`references/spec-driven-development.md`, `references/innovation-patterns.md`,
**`references/agent-loop-harness.md`** (SKILL.md §3–5 extracted),
**`references/session-and-compaction.md`** (SKILL.md §6–7 extracted),
**`references/ai-providers-layer.md`** (SKILL.md §11 extracted),
**`references/codex-architecture.md`** (OpenAI Codex — added 2026-06-13),
**`references/9router-architecture.md`** (9router router patterns — added 2026-06-13),
**`references/multi-provider-routing.md`** (9router multi-provider/OAuth/format-translator catalog — added 2026-06-13),
**`references/provider-model-catalog.md`** (9router 7-category provider classification + 10 service kinds + model metadata schema + real per-provider model lists — added 2026-06-13)

### Code Templates (18 files, 9 TypeScript + 9 Python)

`templates/minimal-agent-loop.ts`, `templates/minimal-harness.ts`,
`templates/minimal-session.ts`, `templates/minimal-tool.ts`,
`templates/minimal-extension.ts`, `templates/minimal-provider.ts`,
**`templates/minimal-provider-fallback.ts`** (with retry — added 2026-06-13),
**`templates/minimal-streaming.ts`** (AsyncIterable streaming — added 2026-06-13),
**`templates/multi-provider-router.ts`** (100+ provider catalog + format translators + OAuth — added 2026-06-13)

Python equivalents in `templates/python/` (`minimal_agent_loop.py` etc.)
**`templates/multi-provider-router.py`** (Python equivalent — added 2026-06-13)

### Supported Agents

Claude Code, Hermes, OpenCode, Codex, Cursor, Antigravity, Pi, Gemini, Aider, Copilot, Amp, Kilo, Kiro, Devin, Trae, CodeBuddy, OpenClaw, Factory Droid

## Work Guidance

### Before Editing SKILL.md

1. Read this AGENTS.md
2. Read HERA_FRAMEWORK.md
3. Verify changes against Pi source code at /root/pi-agent
4. Ensure all code references are accurate

### After Editing

1. Update this AGENTS.md if structure changes
2. Update README.md if user-facing content changes
3. Run verification (see below)

## Verification

- All TypeScript code in SKILL.md must match Pi source code
- All file paths must exist in /root/pi-agent
- All line counts must be accurate
- All type definitions must be correct

## Child DOX Index

This project has no child AGENTS.md files. All content is in root-level files.

## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when `.graphify/graph.json` exists, first run `graphify query "<question>"` (or `graphify path "<A>" "<B>"` / `graphify explain "<concept>"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run the graphify skill with --update when appropriate
- If the user asks to build, update, query, path, or explain the graph, use the installed `graphify` skill instead of ad-hoc file traversal
- Before proposing or committing .graphify artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose `git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update` and `git rm -r --cached .graphify/cache`; never mutate git state without asking
- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation
- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal
- Read `.graphify/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current
