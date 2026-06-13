# Contributing to Hera

Thank you for your interest in contributing to Hera. This document explains how to contribute effectively.

## What is Hera?

Hera is a technical reference document that explains how Pi Agent works internally. It's not a library or framework — it's documentation verified against source code.

## How to Contribute

### Reporting Issues

If you find an error in the documentation:
1. Check if the issue already exists in GitHub Issues
2. Create a new issue with:
   - Section number (e.g., "Section 3.2")
   - What's wrong (e.g., "Type definition is incorrect")
   - Correct information (with source code reference if possible)

### Submitting Changes

1. Fork the repository
2. Create a branch: `git checkout -b fix/section-3-typo`
3. Make your changes
4. Verify against Pi source code at `/root/pi-agent`
5. Commit: `git commit -m "fix: correct type definition in section 3.2"`
6. Push: `git push origin fix/section-3-typo`
7. Open a Pull Request

### What Can Be Contributed?

**Welcome:**
- Fix incorrect code references
- Update line counts when Pi changes
- Add missing details verified from source
- Improve clarity of explanations
- Add new agent support to install.sh
- Fix typos and grammar
- Improve architecture diagrams

**Not Welcome:**
- Unverified information ("I think this is how it works")
- Opinion-based changes ("This pattern is better")
- Speculation about future Pi features
- Marketing or promotional content

### Code References

All code in SKILL.md must be verified against the actual Pi source code. When adding or changing code references:
1. Read the actual source file
2. Copy the exact type/function signature
3. Include the file path and line number
4. Update line counts if needed

### Style Guide

- Use American English
- Keep sentences concise
- Use code blocks for all code references
- Use tables for structured comparisons
- Use Mermaid for architecture diagrams
- No emojis in technical content
- No marketing language ("revolutionary", "game-changing")

### Commit Messages

Follow conventional commits:
- `fix: correct type definition in section 3.2`
- `docs: add mermaid diagram for agent loop`
- `feat: add validation checklist`
- `chore: update line counts`

### Pull Request Process

1. PRs are reviewed for accuracy against Pi source code
2. All code references must be verifiable
3. Changes that affect structure require AGENTS.md updates
4. Large changes should be discussed in an issue first

## Questions?

Open an issue for any questions about contributing.
