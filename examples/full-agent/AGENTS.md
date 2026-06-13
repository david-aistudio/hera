# Example Agent

## Purpose

Complete AI coding agent built with Hera Framework. Demonstrates all patterns from the architecture reference.

## Ownership

- **src/agent/**: Agent loop and agent class
- **src/tools/**: Tool implementations (read, write, bash)
- **src/session/**: Tree-based session storage
- **src/extensions/**: Extension system (logging, security)
- **src/providers/**: LLM provider (simulated OpenAI)

## Work Guidance

### Before Editing

1. Read this AGENTS.md
2. Read the relevant source files
3. Check tests for expected behavior

### After Editing

1. Run `npm test` to verify
2. Update this AGENTS.md if structure changes

## Verification

- `npm test` — Run all tests
- `npm run typecheck` — Type checking
