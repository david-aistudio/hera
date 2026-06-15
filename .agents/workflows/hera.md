# Hera — Architecture Review Workflow

## When to Use

Trigger this workflow when:
- Building a new AI coding agent from scratch
- Reviewing agent architecture for correctness
- Adding new features to an existing agent

## Steps

1. **Read SKILL.md** — Get the full architecture reference
2. **Check focused references** — Use `references/agent-loop-harness.md`, `references/session-and-compaction.md`, etc.
3. **Use code templates** — Copy from `templates/` as starting points
4. **Validate** — Run `hera validate` or `npx hera-agent validate` to check compliance

## Validation Checklist

- Agent loop has two loops (outer + inner)
- Tools have name, description, and execute function
- Session is tree-based (parentId on nodes)
- Error handling: tool errors become error results, not exceptions
- Streaming: AsyncIterable support
- Security: tool sandboxing, no API key logging
- Provider fallback chain exists
