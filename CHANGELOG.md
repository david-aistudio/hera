# Changelog

All notable changes to Hera will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
