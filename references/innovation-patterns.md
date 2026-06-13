# Innovation Patterns — Deep Code Study

Patterns extracted from deep code study of Aider, OpenCode, OpenClaw, and Kilo Code.

## How to Make Your Agent FAST

### Streaming with Incremental Display
From OpenClaw: stream tokens as they arrive. User sees tokens in 100ms instead of waiting 5-30 seconds.

### Parallel Tool Execution
From OpenClaw: execute independent tools in parallel. 5 tools = 1x latency instead of 5x.

### Cache Warming
From Aider: pre-warm cache before sending to LLM. Cached prompts are 10x cheaper and instant.

### Lazy File Loading
From Aider's RepoMap: use tree-sitter to get signatures first, only load full content for relevant files. Read 5 files instead of 50.

## How to Make Your Agent SMART with DUMB Models

### Edit Instructions (not raw code)
From Aider: LLM outputs SEARCH/REPLACE, not full file. Works better with weak models because: bounded scope, verifiable, recoverable.

### Fuzzy Match Recovery
From Aider: when SEARCH block fails exact match, find similar lines. Model writes `const x = 5` but file has `let x = 5`. Fuzzy match finds it.

### Architect + Editor (two models)
From Aider: cheap model plans (gpt-4o-mini), expensive model edits (gpt-4o). Planning is cheap, editing needs precision.

### Linter After Edit
From Aider: run linter immediately after edit. Dumb model writes broken syntax. Linter catches it. Agent reverts and tries again.

### Scout Mode (read before write)
From Kilo Code: explore codebase before making changes. Weak models make fewer mistakes with full context.

### Reference Guidance
From Kilo Code: inject relevant references based on task. Instead of generic prompt, model gets specific guidance about THIS project.

## How to Make Your Agent NOT STUPID

### Self-Healing Loop
Detect when agent is stuck (same tool+args 3x). Recovery strategies: hint different approach, switch model, simplify task, ask user.

### Permission System
From OpenCode: fine-grained permissions. `doom_loop: "ask"`, `read: {"*.env": "ask"}`, `external_directory: {"*": "ask"}`.

### Branch-Aware Compaction
From OpenClaw: compact branches independently. Track which files were read/modified. Don't re-read files agent already knows.

### Typed Errors with Recovery
From OpenCode: RateLimitError → wait and retry. ContextWindowExceededError → compact and retry. AuthError → refresh token.

### Auto-Commit with Rollback
From Aider: auto-commit after every edit. If lint fails, revert. Every change is reversible with `git undo`.

## Combining Patterns

```
SCOUT + ARCHITECT + EDIT FORMAT + LINTER + GIT + SELF-HEALING

1. Scout explores codebase (Kilo Code)
2. Architect plans changes (Aider, cheap model)
3. Editor applies SEARCH/REPLACE (Aider, expensive model)
4. Linter checks syntax (Aider, instant)
5. Git auto-commits (Aider, reversible)
6. Self-healing recovers from mistakes (new)

Result: Agent that's fast, smart with any model, and not stupid.
```
