# Hermes Agent — Deep Architecture Analysis

> **Source**: [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
> **Language**: Python (3.11+)
> **License**: MIT
> **Key Innovation**: Self-improving skills, multi-platform gateway, provider-agnostic, persistent memory, multi-profile isolation

---

## 1. Architecture Overview

Hermes Agent is the most flexible AI agent framework — it runs in CLI, 20+ messaging platforms, IDEs, and as an MCP server from the same codebase. Its key innovations:

1. **Self-improving through skills** — Agent persists reusable procedures as skills; every session makes it better
2. **Multi-platform gateway** — Same agent runs on Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Email, SMS, Feishu, WeChat, BlueBubbles, iMessage, Teams, and 10+ more
3. **Provider-agnostic** — 20+ LLM providers via OpenAI-compatible API; credential pools with auto-failover
4. **Persistent memory** — Pluggable backends (built-in SQLite, Honcho, Mem0) survive across sessions
5. **Multi-profile** — Multiple independent instances with isolated configs, sessions, skills, memory
6. **Delegation system** — Spawn synchronous subagents in isolated contexts; subagent can be orchestrator (delegate further)
7. **Cron scheduler** — Durable jobs with chat delivery, scripts, workdirs, skills attachments
8. **Curator** — Background maintenance of agent-created skills (stale detection, archival, backup)
9. **Kanban** — Multi-profile work-queue for collaborative multi-agent tasks
10. **MCP-native** — Built-in MCP client + can run as MCP server; tools/registry auto-discovery

---

## 2. Core Agent Loop (`run_agent.py` — `AIAgent` class)

### High-level flow

```
run_conversation():
  1. Build system prompt (identity + skills + memory + env hints)
  2. Loop while iterations < max_turns (default 90):
     a. Call LLM (OpenAI-format messages + tool schemas)
     b. If tool_calls → dispatch each via handle_function_call() → append results → continue
     c. If text response → return
  3. Context compression triggers automatically near token limit
```

### `AIAgent` class

- **Stateless per-turn** — every turn re-builds system prompt from current state
- **Streaming** — SSE / chunked response, first token to UI in <100ms typical
- **Tool registry** — `tools/registry.py` auto-discovers all `tools/*.py` with `registry.register()` at import time
- **Toolset gating** — `toolsets.py` defines TOOLSETS dict; platforms inherit `_HERMES_CORE_TOOLS` default
- **Credential pooling** — Multiple API keys per provider rotate automatically; rate-limited keys auto-recover

### Why it's different from other agents

| Concern | Hermes | Most others |
|---|---|---|
| Memory | Pluggable, persists across sessions | Per-session only |
| Skills | Self-curating (curator agent) | Static, manual |
| Platforms | 20+ from one codebase | 1-2 (Telegram + CLI) |
| Profiles | Full isolation | Single instance |
| Tool changes | Hot-swappable via `/tools` (new session) | Restart required |
| LLM providers | 20+ with credential pools | 1-2 |

---

## 3. Multi-Platform Gateway (`gateway/`)

### Architecture

```
Telegram ─┐
Discord ──┤
Slack ────┤
WhatsApp ─┼──► Platform Adapter (base.py) ──► InboundQueue ──► AIAgent ──► OutboundQueue ──► Platform Adapter
Signal ───┤                                          │
Matrix ───┤                                          ├── session routing (state.db)
Email ────┤                                          │
...      ─┘                                          ├── file system (state.db, sessions/)
                                                    ├── log streaming (logs/gateway.log)
```

### Key design decisions

1. **Subprocess isolation** — Platform-specific (e.g. WhatsApp Baileys bridge) runs as Node.js subprocess; Python gateway talks HTTP
2. **Stateful sessions** — `state.db` (SQLite + FTS5) tracks per-chat/per-user session continuity
3. **Pairing-based auth** — `/pairing list/approve/revoke` — DM authorization independent of platform
4. **Topic support** — Telegram topics, Discord threads get isolated session IDs but share user home
5. **Delivery options** — Cron jobs can deliver `origin` (back to chat), `local` (files), `all` (fan-out), or specific `platform:chat_id:thread_id`

### Platform adapters

Each platform implements a common `base.py` interface:
- `start()` / `stop()` — lifecycle
- `send_message(chat_id, text, reply_to)` — outbound
- `edit_message(chat_id, msg_id, text)` — edit in place
- `on_message(callback)` — inbound events
- `enforces_own_access_policy` — DM/group gating

**WhatsApp quirk**: Most complex — uses Baileys (Node.js) bridge subprocess because Meta doesn't allow official personal bot API. Supports both **self-chat** mode (you chat yourself) and **bot mode** (separate number, allowlisted users).

---

## 4. Tool System (`tools/registry.py` + `toolsets.py`)

### Auto-discovery

```python
# Any tools/foo.py with this at module level auto-registers:
from tools.registry import registry

def my_tool(arg: str) -> str:
    return json.dumps({"success": True, "data": f"processed {arg}"})

registry.register(
    name="my_tool",
    toolset="custom",
    schema={"name": "my_tool", "description": "...", "parameters": {...}},
    handler=lambda args, **kw: my_tool(args.get("arg", ""), task_id=kw.get("task_id")),
    check_fn=lambda: bool(os.getenv("MY_API_KEY")),
    requires_env=["MY_API_KEY"],
)
```

The agent's main process imports `tools/*.py` at startup; any `registry.register()` call at module level auto-registers. No central list to maintain.

### Toolsets (gated groups)

```yaml
_TOOLSETS = {
    "web": ["web_search", "web_extract"],
    "browser": ["browser_navigate", "browser_click", "browser_type", ...],
    "terminal": ["terminal"],
    "file": ["read_file", "write_file", "search_files", "patch"],
    "delegation": ["delegate_task"],
    "messaging": ["send_message"],
    "memory": ["memory"],
    "skills": ["skill_view", "skill_manage", "skills_list"],
    "cronjob": ["cronjob"],
    "tts": ["text_to_speech"],
    "vision": ["vision_analyze"],
    "image_gen": ["generate_image"],
    ...
}
```

Platforms inherit `_HERMES_CORE_TOOLS` (safe + web + file + terminal) and can override. Sensitive tools (`debugging`, `homeassistant`, `rl`) are off by default.

---

## 5. Skills System — Self-Improving Agent

### What is a skill?

A `SKILL.md` file with YAML frontmatter + markdown body that the agent loads on demand. Located in:
- `~/.hermes/skills/<name>/SKILL.md` (bundled + hub-installed)
- `~/.hermes/profiles/<name>/skills/<name>/SKILL.md` (per-profile)

### Skill loading flow

```
User asks: "Build a FastAPI auth service"
  ↓
Agent scans frontmatter `description:` of all skills
  ↓
Matches "build a FastAPI..." → loads `fastapi` skill
  ↓
Skill body becomes available context for this turn
```

### Curator — autonomous skill maintenance

The **curator** is a background process that:
- Tracks per-skill usage (use_count, view_count, patch_count)
- Marks idle skills stale after `curator.stale_after_days`
- Archives stale skills (never deletes — max destructive action is archive)
- Creates pre-archive tar.gz backup
- Pinned skills exempt from all auto-transitions

This means **the agent literally improves over time** as it solves more problems and saves them as skills.

---

## 6. Provider Abstraction (`model_tools.py` + `agent/*_adapter.py`)

### 20+ supported providers

| Provider | Auth | Adapter |
|---|---|---|
| OpenRouter | API key | OpenAI-compatible |
| Anthropic | API key | Native + streaming |
| OpenAI / Codex | API key + OAuth | Native + Codex Responses |
| GitHub Copilot | OAuth token | Native (device code) |
| Google Gemini | API key | Native (separate auth) |
| DeepSeek | API key | OpenAI-compatible |
| xAI / Grok | API key | OpenAI-compatible |
| 12+ Chinese (MiniMax, GLM, Kimi, Qwen, Xiaomi MiMo, etc.) | API key | OpenAI-compatible |
| Custom endpoint | YAML config | OpenAI-compatible |
| Honcho memory | OAuth | Honcho adapter |

### Credential pooling

```yaml
# config.yaml
credential_pool_strategies:
  openrouter: round_robin  # or lowest_latency, random
```

Multiple API keys per provider are stored in `~/.hermes/auth.json` and rotated on rate-limit / 429 / auth errors. **Auto-recovery** via `_pool_may_recover_from_rate_limit` — a 429'd key is quarantined for `RATE_LIMIT_COOLDOWN_SECONDS` then retried.

### Auxiliary model routing

Tasks like vision, session_search, compression can use a different (cheaper) model than the main conversation:

```yaml
auxiliary:
  vision:
    provider: auto  # detects from API keys
    model: anthropic/claude-haiku-4.5
  compression:
    provider: openai
    model: gpt-5-mini
```

---

## 7. Memory System

### Built-in: `~/.hermes/state.db` (SQLite + FTS5)

- Sessions: `id, title, source, created_at, updated_at, jsonl_path, json_snapshot_path`
- Messages: full FTS5-indexed content for `/session_search` and `session_search` tool
- Compression: older sessions get context-compressed on age threshold

### Pluggable backends

- **Built-in** (default): SQLite, no extra deps
- **Honcho**: cross-session dialectic memory; `hermes honcho setup`
- **Mem0**: external managed memory

### Two scopes

- `memory` — agent's own notes (procedural knowledge, environment facts, tool quirks)
- `user` — persistent user profile (preferences, communication style, project context)

Both are injected into every session as system prompt context.

---

## 8. Delegation System (`delegate_task` tool)

### Two modes

1. **Single task** — `delegate_task(goal, context, toolsets)` — runs synchronously, parent waits for summary
2. **Batch (parallel)** — `delegate_task(tasks=[...])` — up to `delegation.max_concurrent_children` (default 3) in parallel

### Roles

- `leaf` (default) — focused worker, cannot re-delegate
- `orchestrator` — can spawn own workers, but `max_spawn_depth` (default 1) prevents infinite recursion

### Use cases

- **Reasoning-heavy subtasks** — debugging, code review, research synthesis
- **Parallel independent work** — research A and B simultaneously
- **Context isolation** — subagent gets fresh context, parent's not flooded

### Subagents are **leaf** (synchronous)

If parent is interrupted (`/stop`, `/new`), child is cancelled. For work that must outlive the turn → use `cronjob` or `terminal(background=True, notify_on_complete=True)`.

---

## 9. Cron Scheduler (`cron/`)

### Durable jobs

```bash
hermes cron create "every 2h" "Summarize my unread emails"
hermes cron create "0 9 * * 1-5" "Generate weekly report" --deliver telegram
hermes cron create "30m" "Run system health check" --script ~/.hermes/scripts/health.sh
```

### Per-job knobs

- `skills` — load these skills in the run session
- `model`/`provider` — override main model
- `script` — pre-run data collection
- `context_from` — chain job A's output into job B
- `workdir` — run inside a project repo (loads AGENTS.md / CLAUDE.md)
- `no_agent` — script IS the job (no LLM, perfect for watchdogs)
- `deliver` — `origin` / `local` / `all` / `platform:chat_id:thread_id`

### Invariants

- 3-minute hard interrupt per run
- `.tick.lock` prevents duplicate ticks across processes
- Cron sessions pass `skip_memory=True` (don't pollute long-term memory)
- Deliveries framed with header/footer (preserves role alternation)

---

## 10. Session Management (`hermes_state.py` + `state.db`)

### Session ID format

`YYYYMMDD_HHMMSS_<6-char-hash>` — sortable + unique.

### Session routing

Gateway routes inbound messages to a session by:
1. `source:chat_id` lookup in routing index
2. Topic/thread ID (Telegram) or channel ID (Discord) for sub-sessions
3. New session created with metadata: platform, chat_id, user_id, source

### Cross-session search

`session_search` tool (FTS5) — finds past sessions by content, ranks by relevance or recency. Critical for **continuity across days** without manual context loading.

---

## 11. Configuration & Profiles

### Two config files

- `~/.hermes/config.yaml` — settings (committed to repo if public, but Hermes stores in home)
- `~/.hermes/.env` — API keys, secrets (never committed)

### Profiles (`~/.hermes/profiles/<name>/`)

Each profile has its own:
- `config.yaml` + `.env`
- `skills/` (per-profile skills)
- `sessions/`
- `memory/`
- `cron/`
- `plugins/`

Use cases:
- **Work vs personal** — completely separate API keys, memories, models
- **Multi-tenant** — agency serving multiple clients, each isolated
- **A/B testing** — try different configs in parallel
- **Backup/restore** — `hermes profile export/import` to tar.gz

### `hermes -p <name>` to switch

Or `hermes profile use <name>` to set sticky default.

---

## 12. Unique Innovations

1. **Skills are first-class** — Not a `docs/` folder, but auto-curated with usage tracking
2. **Curator agent** — Background maintenance prevents skill rot
3. **Multi-platform from one process** — Most agents are 1-2 platforms; Hermes is 20+
4. **Profile isolation** — True multi-tenant; most agents are single-tenant
5. **Credential pooling with auto-failover** — Rate-limit recovery; not just static API keys
6. **Kanban work-queue** — Multi-agent coordination board with SQL-backed state
7. **TUI + CLI + Gateway** — Three UIs from same core, all using same AIAgent loop
8. **MCP-native** — Both MCP client (consume) and MCP server (expose) — not bolted on
9. **Toolset gating per platform** — Sensitive tools (`debugging`, `rl`, `moa`) opt-in
10. **Auxiliary model routing** — Vision/compression use cheaper models automatically

---

## 13. Lessons for Building Your Own Agent

1. **Skills > system prompt** — Loading on-demand keeps context lean; persist as you go
2. **Profile isolation early** — Refactoring later is painful
3. **One core loop, many UIs** — `AIAgent.run_conversation()` is the heart; CLI/Telegram/etc are thin adapters
4. **Pluggable memory** — Don't lock into one backend
5. **Credential pools** — Single API key is a single point of failure
6. **Cron + Kanban > custom scheduling** — Built-in durable primitives beat ad-hoc
7. **Curator for content** — Skills, memories, sessions all need lifecycle management
8. **FTS5 for session search** — Full-text search across all past sessions is incredibly powerful
9. **MCP from day one** — Both as client and server; the ecosystem is real
10. **Hot-reload tools via `/tools`** — Toggling toolset doesn't require restart (new session only)

---

## 14. Comparison Summary

| Feature | Hermes | Pi | OpenCode | Aider | ECC | Claude Code |
|---|---|---|---|---|---|---|
| Platforms | **20+** | 1 (TUI) | 2 (TUI+Web) | 1 (CLI) | 1 (CLI) | 1 (TUI) |
| Self-improving | **Yes (skills)** | No | No | No | No | No |
| Memory | **Pluggable** | Per-session | Per-session | Per-session | Per-session | Per-session |
| Cron | **Yes** | No | No | No | No | No |
| Multi-profile | **Yes** | No | No | No | No | No |
| MCP client+server | **Yes** | Client only | Client only | No | No | Yes |
| Credential pool | **Yes** | No | No | No | No | No |
| Kanban work-queue | **Yes** | No | No | No | No | No |
| Curator | **Yes** | No | No | No | No | No |

---

## 15. References

- GitHub: https://github.com/NousResearch/hermes-agent
- Docs: https://hermes-agent.nousresearch.com/docs
- Skills hub: `npx skills add ahmdd4vd/hera` (this very reference is shipped there)
- Companion: `npx graphify @sentropic/graphify` for codebase analysis (what built this reference)

> **Note from the author**: This reference was written by a Hermes Agent instance while running on MiniMax-M3 via TokenRouter. The "self-improving" claim isn't theoretical — filling in 638 graph descriptions across 16 batches earlier today is a direct example of `delegate_task` + skill-driven knowledge work.
