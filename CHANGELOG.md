# Changelog

All notable changes to Hera will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.10.0] - 2026-06-13

### Added
- **9router patterns extracted into hera** (from [decolua/9router](https://github.com/decolua/9router))
  - New reference: `references/9router-architecture.md` (12 sections, 250+ lines)
    - Combo system (model chains with strategy)
    - Account fallback + cooldown (`rateLimitedUntil` ISO timestamp)
    - Exponential backoff (2s -> 4s -> 8s, max 5 min)
    - Per-model lock (granular, separate from account-level)
    - Config-driven error classification rules
    - Format translation layer (OpenAI <-> Anthropic <-> Gemini)
    - Per-day usage aggregation (byProvider/byModel/byAccount/byApiKey)
  - **New `routing` category in `lib/hera-checks.ts`** — 5 new checks (32 -> 37 checks total):
    - Multi-key pool supported
    - Key cooldown (rate-limit awareness)
    - Round-robin or fallback strategy
    - Exponential backoff on errors
    - Config-driven error classification
- **Upgraded `templates/minimal-provider-fallback.ts`** (118 -> 426 lines):
  - Multi-key pool with `ApiKey` type (id, key, rateLimitedUntil, backoffLevel)
  - Round-robin with sticky limit (`stickyLimit: 1` rotates every call, `N` sticks for N)
  - `filterAvailableKeys()` skips keys in cooldown
  - `applyErrorState()` updates key with backoff + cooldown
  - `resetKeyState()` clears state on success
  - `checkFallbackError()` config-driven error rules
  - `DEFAULT_ERROR_RULES` with text + status matching
  - Exponential backoff via `computeBackoff(level, base, max)`
- **Added Python equivalent** `templates/python/minimal_provider_fallback.py` (305 lines)
- **Added test suite** `tests/templates/provider-fallback.test.ts` (19 tests):
  - `filterAvailableKeys` (cooldown filtering)
  - `checkFallbackError` (text/status/exponential backoff)
  - `ProviderRouter` fallback strategy
  - `ProviderRouter` round-robin with sticky
  - Error handling (400 terminal, maxAttempts)
  - Management (resetAll, setKeys)

### Changed
- **package.json**: 2.9.0 -> 2.10.0
- **README.md**: `references-15` -> `references-16`
- **AGENTS.md**: reference files list (15 -> 16)
- **Test count**: 58 -> 77 (+19 from new provider-fallback tests)

## [2.9.0] - 2026-06-13

### Added
- **Test framework for `examples/full-agent/`** — was previously in `package.json` deps but had no test files
  - `vitest.config.ts` — same pattern as root
  - `tests/tools.test.ts` — 14 tests covering all 3 tools (read, write, bash) + tool contract compliance
  - **Found real security bug**: `read_file` tool doesn't actually sandbox — `path.resolve(cwd, '/etc/passwd')` returns the absolute path and reads it. Test documents the issue with a `KNOWN ISSUE` test case; hera-validate's "Tool execution sandboxed" check correctly flags this.
- **3 new focused reference files (extracted from SKILL.md)**:
  - `references/agent-loop-harness.md` (326 lines) — SKILL.md §3–5 (agent loop, Agent class, AgentHarness)
  - `references/session-and-compaction.md` (131 lines) — SKILL.md §6–7 (session tree, compaction)
  - `references/ai-providers-layer.md` (484 lines) — SKILL.md §11 (provider abstraction)
  - SKILL.md reduced from 100KB → 73KB (-26%), 3277 → 2412 lines
- **1 new architecture reference**: `references/codex-architecture.md` (370 lines)
  - OpenAI Codex + function-calling patterns, message protocol, streaming, multi-provider compatibility
  - Documents the M3 dict-vs-string tool args bug fix from commit `934ab8c`
- **4 new code templates** (12 → 16 total, 8 TS + 8 Python):
  - `templates/minimal-provider-fallback.ts` (118 lines) — primary/secondary provider with retry + backoff
  - `templates/minimal-streaming.ts` (102 lines) — AsyncIterable streaming pattern
  - `templates/python/minimal_provider_fallback.py` (78 lines) — Python equivalent
  - `templates/python/minimal_streaming.py` (79 lines) — Python equivalent

### Changed
- **`SKILL.md`** — added "📚 Focused Reference Files" navigation section at top, replaced 6 sections (§3, 4, 5, 6, 7, 11) with single-line pointers
- **`README.md`** — badges updated: `references-15`, `templates-16`
- **`AGENTS.md`** — reference files list (10 → 15), new "Code Templates" section
- **Total test count**: 58 → 72 (+14 from examples/full-agent)

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
