# Python Example Agent

## Purpose

Complete AI coding agent built with Hera Framework in Python. Demonstrates all patterns from the architecture reference.

## Ownership

- **src/agent/**: Agent loop and agent class
- **src/tools/**: Tool implementations (read, write, bash)
- **src/session/**: Session storage with branching
- **src/extensions/**: Extension system (logging, security, timing)
- **src/providers/**: LLM providers (OpenAI, Anthropic)

## Work Guidance

### Before Editing

1. Read this AGENTS.md
2. Read the relevant source files
3. Check tests for expected behavior

### After Editing

1. Run `pytest` to verify
2. Update this AGENTS.md if structure changes

## Verification

- `pytest` — Run all tests
- `python -m src.main` — Run in interactive mode
