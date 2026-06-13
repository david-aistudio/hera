# Changelog

All notable changes to Hera will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.8.0] - 2026-06-13

### Added
- **8 new validator checks** in 2 new categories
  - `streaming` category (3 checks): Streaming response (AsyncIterable), Cancellation propagation, Token usage tracking
  - `quality` category (5 checks): Test suite, CI workflow, Provider fallback, Cost guard, Observability
  - Total checks: 24 → 32 (+33% coverage)
- **`hint` field on every check** — actionable code snippets shown alongside failure messages
  - CLI now prints `→ Message` (yellow) followed by `💡 Hint` (cyan) for each failed check
  - 13 checks include hints with concrete code examples (e.g. `class AgentHarness { private agent: Agent; ... }`)
- **Dynamic CLI banner** — reads `package.json` at startup, no more version drift
  - `bin/hera.js` shows `Hera v{version}` and `{N} AI agents supported` from package.json + AGENTS object
  - `cli/hera-graph.ts` shows `Hera v{version}` in summary and help
  - Graceful fallback to hardcoded values if package.json can't be read

### Changed
- **`lib/hera-checks.ts`** — `Check` interface now has optional `hint?: string` field
- **`lib/hera-validator.ts`** — `CheckResult` propagates `hint` to CLI consumers
- **`cli/hera-validate.ts`** — prints `💡` hint line after each failure message
- **Test count**: 46 → 58 (+12 new tests for streaming, quality, hint field, dynamic banner)

## [2.7.3] - 2026-06-13

### Added
- **Real test suite with Vitest** — 46 tests across 3 files
  - `tests/lib/hera-checks.test.ts` — 23 unit tests for the 6 architectural check categories
  - `tests/lib/hera-validator.test.ts` — 9 integration tests for `getSourceFiles` and `validateProject`
  - `tests/cli.test.ts` — 14 CLI integration tests for `bin/hera.js`, `cli/hera-graph.ts`, `cli/hera-validate.ts`
- **`lib/hera-checks.ts`** — extracted pure check functions (testable in isolation)
- **`lib/hera-validator.ts`** — extracted `validateProject()` and `getSourceFiles()` from the CLI
- **`vitest.config.ts`** — minimal Vitest config (Node env, 30s timeout)
- **`tsconfig.json`** — ES2022 + bundler resolution, used by Vitest and editor tooling
- **CI `test` job** — runs `npm test` on every push and PR

### Changed
- **`cli/hera-validate.ts`** — refactored from 374 lines into a thin CLI wrapper that imports from `lib/hera-validator.js`
- **`bin/hera.js`** — subcommand dispatch now happens BEFORE the `--help` check, so `npx hera-agent graph --help` correctly delegates
- **`install.sh`** bug fixes:
  - `trap 'rm -rf "$TEMP_DIR"' EXIT` cleans up temp dir (was leaking)
  - `download_file` uses `curl -fSL` and atomic `mv` from a temp file (partial downloads no longer corrupt target)
  - `all` mode now installs all 18 agents (was silently skipping codex, aider, amp, trae, claw, droid)
- **`package.json`** scripts: `test` → `vitest run`; added `test:watch`, `test:ui`, `typecheck`, `validate`
- **`package.json`** devDependencies: `vitest@^3`, `typescript@^5.7`, `@types/node@^22`, `tsx@^4.19`

### Fixed
- **Real bug in check pattern**: `Sequential execution support` used `code.includes("for...of")` (3 dots) which never matches valid JS. Replaced with regex `/\bfor\b.*\bof\b/`.
- **Dispatcher order bug**: `npx hera-agent graph --help` was printing the installer's help instead of delegating to hera-graph.

### Notes
- Tests run in ~6 seconds; CI uses Node 22 (matches `.nvmrc`).

## [2.7.2] - 2026-06-13

### Added
- **`cli/hera-graph.ts`** — new subcommand to visualize the Graphify knowledge graph
  - `npx hera-graph summary` — top hubs, communities, density
  - `npx hera-graph stats` — just the numbers
  - `npx hera-graph query <term>` — search the graph for a concept
  - `npx hera-graph path <a> <b>` — shortest path between two nodes
  - `npx hera-graph explain <node>` — neighbors + relationships
- **`.github/workflows/ci.yml`** — GitHub Actions CI with 3 jobs:
  - `lint` — validate package.json, `bin/hera.js` syntax, TypeScript CLI files, markdown presence
  - `size` — guard SKILL.md size (<200KB warning) + reference files count (>=8 required)
  - `graph` — verify `.graphify/` knowledge graph is present
- **`.editorconfig`** — 2-space indent for JS/TS/JSON/YAML, 4-space for Python, LF line endings
- **`.nvmrc`** — pins Node.js v22 (matches `validate` action's setup-node)

### Fixed
- **Version drift**: `package.json` was still at `2.5.1` while CHANGELOG was at `2.7.1` — bumped to `2.7.1`
- **Stale README badges**:
  - `version-2.6.0` → `version-2.7.1`
  - `references-9` → `references-10` (Hermes architecture was added in 2.7.1)
- **References list in README** updated from 9 to 10 entries with Hermes architecture highlighted

### Changed
- `bin/hera.js` — added `graph` subcommand dispatcher that delegates to `cli/hera-graph.ts` via `tsx`
- `package.json`:
  - Added `"graph": "tsx cli/hera-graph.ts"` script
  - Bumped `version` 2.5.1 → 2.7.1

## [2.7.1] - 2026-06-13

### Added
- **`references/hermes-architecture.md`** — Hermes Agent deep architecture analysis
  - Multi-platform gateway (20+ messaging platforms from one codebase)
  - Self-improving skills system with background Curator maintenance
  - Provider abstraction with credential pooling and auto-failover
  - Multi-profile isolation, MCP-native (client + server), cron scheduler
  - Kanban work-queue, delegation, session FTS5 search
  - Written by a Hermes Agent instance running on MiniMax-M3 via TokenRouter

### Changed
- `README.md` — added Hermes architecture reference to references table and file tree
- `AGENTS.md` — added reference files section listing all 10 references
- `.gitignore` — added Python `__pycache__/` and `*.pyc` patterns (were previously tracked in `examples/python-agent/src/`)

### Notes
- The Python cache files under `examples/python-agent/src/__pycache__/` and `examples/python-agent/src/agent/__pycache__/` are currently tracked in git history. Run `git rm -r --cached examples/python-agent/src/**/__pycache__` in a follow-up commit to untrack them; they will remain in history.

## [2.0.0] - 2026-06-13

### Added
- **Section 18: Multi-Agent Knowledge** — 10 architectural patterns from deep code study
  - Edit Formats (Aider): SEARCH/REPLACE, not raw code
  - Architect Pattern (Aider): cheap model plans, expensive model edits
  - Git-Native Workflow (Aider): auto-commit, reversible changes
  - Effect-TS Architecture (OpenCode): typed errors, dependency injection
  - Agent-Harness Separation (OpenClaw): pure logic vs orchestration
  - Branch Summarization (OpenClaw): compact branches independently
  - Permission Levels (Claude Code): auto/confirm/block per tool
  - Scout Mode (Kilo Code): explore codebase before editing
  - Reference Guidance (Kilo Code): context-aware prompts
  - Container Sandboxing (Codex): isolated execution
- **Decision Framework** — 15 decision points with conditions, justification, risks, mitigation
  - Edit format, agent architecture, git integration, permissions, context strategy
  - Error handling, streaming, parallel tools, compaction, model selection
  - Sandboxing, session storage, timeouts, retry strategy, logging
- **Anti-Patterns** — 15 patterns with real failure examples, solutions, and code
  - Raw LLM output, single agent, no version control, untyped errors
  - Monolithic agent, linear compaction, no permissions, jump to editing
  - Generic prompts, unsandboxed execution, no context budget, blocking tools
  - No streaming, hardcoded provider, no user feedback
- **Section 32: Innovation Patterns** — 13 patterns from deep code study
  - FAST: Streaming, parallel tools, cache warming, lazy file loading
  - SMART: Edit instructions, fuzzy match, architect+editor, linter, scout, references
  - NOT STUPID: Self-healing, permissions, branch compaction, typed errors, auto-commit
- **references/innovation-patterns.md** — Full innovation patterns document
- **Multi-Provider System** — Section 11.1 completely rewritten
  - Provider interface, built-in providers, custom providers
  - OpenAI-compatible endpoints (Ollama, vLLM, LiteLLM)
  - Provider registry, fallback chain, task-based routing
  - YAML configuration

### Changed
- README.md — completely rewritten for v2.0.0
- SKILL.md — 32 sections, 3100+ lines (was 18 sections, 1600 lines)

## [1.4.0] - 2026-06-13

### Added
- Python templates (section 25) — 6 production-ready Python implementations:
  - `templates/python/minimal_agent_loop.py` — Core loop (async, dataclasses, Protocol)
  - `templates/python/minimal_provider.py` — OpenAI + Anthropic providers with streaming
  - `templates/python/minimal_tool.py` — Tool system with validation, registry, multi-format export
  - `templates/python/minimal_session.py` — Session with branching, JSON persistence, context windows
  - `templates/python/minimal_extension.py` — Extension system with lifecycle hooks
  - `templates/python/minimal_harness.py` — Top-level orchestrator wiring everything together
- Production patterns (section 33) — `docs/PATTERNS.md`:
  - Circuit breaker for LLM provider calls
  - Token bucket rate limiter with adaptive adjustment
  - Health checks for all components
  - Graceful shutdown with in-flight task tracking
  - Connection pooling for HTTP clients
  - Structured JSON logging
  - Metrics collection (counters, histograms, gauges)
- Streaming patterns (section 34) — `docs/STREAMING.md`:
  - SSE parsing with tool call delta assembly
  - WebSocket streaming for real-time agents
  - Chunked response assembly
  - Backpressure handling
  - Token-by-token callbacks
- Memory management (section 35) — `docs/MEMORY.md`:
  - Token counting (tiktoken + approximation)
  - Context window budget management
  - Conversation compression with LLM summarization
  - Sliding window with automatic compression
  - Smart truncation strategies (oldest-first, keep-system, keep-tools)
- Multi-model routing (section 36) — `docs/ROUTING.md`:
  - Provider router with task-type based selection
  - Fallback chain for provider outages
  - Cost tracking and optimization
  - Load balancing across provider instances

### Changed
- README.md — updated to 36 sections, 12 templates, Python + TypeScript
- Version bumped to 1.4.0

## [1.3.0] - 2026-06-13

### Added
- CLI tools (section 28):
  - `hera init` — Scaffold a new agent project with interactive setup
  - `hera validate` — Validate implementation against 11 categories
- Example agent (section 29):
  - Complete working agent in `examples/full-agent/`
  - Demonstrates all patterns: agent loop, tools, session, extensions, providers
  - Includes test suite (unit, integration, E2E)
- DEPLOYMENT.md (section 30):
  - Local deployment (CLI, background service, systemd)
  - Docker deployment (Dockerfile, docker-compose)
  - Cloud deployment (Railway, Render, Fly.io, AWS Lambda, Vercel)
  - Configuration, monitoring, scaling guides
- GitHub Actions (section 31):
  - `.github/actions/validate/action.yml` for CI/CD integration
  - Automated validation on pull requests

### Changed
- SKILL.md — added sections 28-31
- README.md — updated to 31 sections

## [1.2.0] - 2026-06-13

### Added
- Code templates (section 24) — 6 minimal working examples:
  - `templates/minimal-agent-loop.ts` — Core loop implementation
  - `templates/minimal-tool.ts` — Tool creation (read, bash, ask_user)
  - `templates/minimal-session.ts` — Tree-based session with branching
  - `templates/minimal-provider.ts` — LLM provider abstraction with streaming
  - `templates/minimal-harness.ts` — Orchestration layer with queues
  - `templates/minimal-extension.ts` — Plugin system with events and tools
- SECURITY.md — Security patterns:
  - Tool sandboxing (command whitelist/blacklist, file access)
  - Permission system (auto/confirm/block levels)
  - Input validation and output sanitization
  - API key security and audit logging
- ERROR_HANDLING.md — Error handling patterns:
  - Retry with exponential backoff
  - Graceful degradation and partial results
  - Error propagation and recovery
  - User-facing error messages
- TESTING.md — Testing patterns:
  - Unit tests for tools, messages, sessions
  - Integration tests for agent loop and tool execution
  - Mock patterns (LLM, tools, session)
  - Test fixtures and E2E tests

### Changed
- SKILL.md — added sections 24-27 referencing new files
- README.md — updated to 27 sections

## [1.1.0] - 2026-06-13

### Added
- Validation checklist (section 21) — 11 categories with checkboxes
- Mermaid architecture diagrams (section 20) — 6 diagrams:
  - Agent loop two-loop design
  - Tool execution flow
  - Session tree structure
  - Event flow sequence
  - Extension system
  - Package dependencies
- CHANGELOG.md — version history
- CONTRIBUTING.md — contribution guidelines
- Hera Framework integration (HERA_FRAMEWORK.md)

### Changed
- README.md — restructured with installation section higher
- AGENTS.md — updated with Hera Framework contract

## [1.0.0] - 2026-06-13

### Added
- Initial release
- SKILL.md — 19 sections covering complete Pi Agent architecture
- Multi-agent installation script (18 agents supported)
- Agent-specific config files (CLAUDE.md, .cursor/rules, .agents/, .kiro/)
- README.md with professional documentation
- package.json with npm metadata
- MIT License

### Architecture Sections
1. Package Structure
2. Core Types
3. Agent Loop
4. Agent Class
5. Agent Harness
6. Session System
7. Compaction System
8. Message Conversion
9. Tool System
10. Extension System
11. AI Layer
12. System Prompt
13. Skills & Templates
14. Event Architecture
15. Design Patterns
16. Implementation Guide
17. Pitfalls & Lessons
18. File Reference
19. Comparison with Other Agents

### Supported Agents
Claude Code, Hermes, OpenCode, Codex, Cursor, Antigravity, Pi, Gemini, Aider, Copilot, Amp, Kilo, Kiro, Devin, Trae, CodeBuddy, OpenClaw, Factory Droid
