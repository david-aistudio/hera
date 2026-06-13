# Hera Framework

Hera is a structural framework for organizing AI coding agent projects using AGENTS.md hierarchies. It keeps large projects maintainable, consistent, and easy for both humans and AI agents to navigate.

---

## Core Contract

- AGENTS.md files are **binding work contracts** for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it
- Every AI agent that works on the project must follow the AGENTS.md chain

---

## Read Before Editing

Before editing ANY file:

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken Hera

Do not rely on memory. Re-read the applicable Hera chain in the current session before editing.

---

## Update After Editing

Every meaningful change requires a Hera pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- Purpose, scope, ownership, or responsibilities
- Durable structure, contracts, workflows, or operating rules
- Required inputs, outputs, permissions, constraints, side effects, or artifacts
- User preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately.

Small edits that do not change behavior or contracts may leave docs unchanged, but the Hera pass still must happen.

---

## Hierarchy

```
project/
├── AGENTS.md              ← Root: project-wide contract
├── src/
│   ├── AGENTS.md          ← Child: source code contract
│   ├── agent/
│   │   └── AGENTS.md      ← Grandchild: agent module contract
│   ├── tools/
│   │   └── AGENTS.md      ← Grandchild: tools module contract
│   └── session/
│       └── AGENTS.md      ← Grandchild: session module contract
├── tests/
│   └── AGENTS.md          ← Child: test contract
└── docs/
    └── AGENTS.md          ← Child: documentation contract
```

**Rules:**
- Root AGENTS.md is the Hera rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

---

## Child Doc Shape

Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards.

Default section order:

```markdown
# [Module Name]

## Purpose
[What this module does, 1-2 sentences]

## Ownership
[Who owns this, what files are here]

## Local Contracts
[Rules specific to this module]

## Work Guidance
[How to work in this module — before editing, after editing]

## Verification
[How to verify changes — commands, tests, checks]

## Child DOX Index
[List of child AGENTS.md files if any]
```

---

## Templates

### Template 1: Coding Agent Project

```markdown
# [Agent Name]

## Purpose
AI coding agent that [does what]. Built with [framework/stack].

## Ownership
- **src/agent/**: Agent loop and state management
- **src/tools/**: Tool implementations
- **src/session/**: Conversation history and persistence
- **src/providers/**: LLM provider integrations
- **tests/**: Test suite

## Local Contracts
- All tools must implement the Tool interface (see src/tools/types.ts)
- Provider must support streaming (see src/providers/interface.ts)
- Session must persist across restarts (see src/session/storage.ts)

## Work Guidance
### Before Editing
1. Read this AGENTS.md
2. Read the relevant source file
3. Check tests for expected behavior

### After Editing
1. Run `npm test` to verify
2. Update this AGENTS.md if structure changes

## Verification
- `npm test` — Run all tests
- `npm run lint` — Check code style
- `npm run typecheck` — Type checking

## Child DOX Index
- `src/tools/AGENTS.md` — Tool implementations
- `src/session/AGENTS.md` — Session management
```

### Template 2: Web Application

```markdown
# [App Name]

## Purpose
Web application that [does what]. Built with [framework].

## Ownership
- **src/pages/**: Page components
- **src/components/**: Reusable UI components
- **src/api/**: API routes and handlers
- **src/lib/**: Shared utilities
- **prisma/**: Database schema and migrations

## Local Contracts
- All pages must be responsive (mobile + desktop)
- API routes must validate input (see src/api/validators/)
- Database changes require migrations (see prisma/migrations/)

## Work Guidance
### Before Editing
1. Check if the component/page already exists
2. Review existing patterns in similar components

### After Editing
1. Run `npm run build` to verify
2. Test in browser (desktop + mobile)

## Verification
- `npm run build` — Build check
- `npm run test` — Unit tests
- `npm run lint` — Code style

## Child DOX Index
- `src/api/AGENTS.md` — API routes
- `src/components/AGENTS.md` — UI components
```

### Template 3: Library/Package

```markdown
# [Package Name]

## Purpose
[Language] library that [does what]. Published to [npm/pypi/crates].

## Ownership
- **src/**: Source code
- **tests/**: Test suite
- **docs/**: Documentation
- **examples/**: Usage examples

## Local Contracts
- Public API must be documented (see src/index.ts)
- Breaking changes require major version bump
- All public functions must have tests

## Work Guidance
### Before Editing
1. Check if the change affects public API
2. Review existing tests for the function

### After Editing
1. Run tests
2. Update documentation if API changed
3. Update CHANGELOG.md

## Verification
- `npm test` — Run tests
- `npm run build` — Build check
- `npm run docs` — Generate docs

## Child DOX Index
- `src/AGENTS.md` — Source code
- `tests/AGENTS.md` — Test suite
```

### Template 4: API Server

```markdown
# [API Name]

## Purpose
REST/GraphQL API server that [does what]. Built with [framework].

## Ownership
- **src/routes/**: API route handlers
- **src/models/**: Data models
- **src/middleware/**: Express/Fastify middleware
- **src/services/**: Business logic
- **src/db/**: Database queries and migrations

## Local Contracts
- All routes must validate input (see src/middleware/validate.ts)
- All routes must handle errors (see src/middleware/errorHandler.ts)
- Database changes require migrations

## Work Guidance
### Before Editing
1. Check existing routes for similar patterns
2. Review middleware that applies to the route

### After Editing
1. Run tests
2. Test the endpoint manually (curl/Postman)

## Verification
- `npm test` — Run tests
- `npm run migrate` — Run migrations
- `curl localhost:3000/health` — Health check

## Child DOX Index
- `src/routes/AGENTS.md` — API routes
- `src/models/AGENTS.md` — Data models
```

### Template 5: Monorepo

```markdown
# [Project Name]

## Purpose
Monorepo containing [list of packages/apps].

## Ownership
- **packages/**: Shared libraries
- **apps/**: Applications
- **config/**: Shared configuration
- **scripts/**: Build and deployment scripts

## Local Contracts
- Each package must have its own AGENTS.md
- Shared dependencies go in root package.json
- Cross-package imports use @project/package-name

## Work Guidance
### Before Editing
1. Identify which package/app you're working in
2. Read that package's AGENTS.md
3. Check if changes affect other packages

### After Editing
1. Run tests for affected packages
2. Run `pnpm build` to verify builds

## Verification
- `pnpm test` — Run all tests
- `pnpm build` — Build all packages
- `pnpm lint` — Lint all packages

## Child DOX Index
- `packages/core/AGENTS.md` — Core library
- `packages/ui/AGENTS.md` — UI components
- `apps/web/AGENTS.md` — Web application
- `apps/api/AGENTS.md` — API server
```

---

## Real Examples

### Example 1: Pi Agent Structure

```
pi/
├── AGENTS.md                    Root contract
├── packages/
│   ├── agent/
│   │   ├── AGENTS.md            Agent module contract
│   │   ├── src/
│   │   │   ├── agent-loop.ts    Core agent loop
│   │   │   ├── agent.ts         Agent class
│   │   │   └── types.ts         Core types
│   │   └── test/
│   ├── coding-agent/
│   │   ├── AGENTS.md            Coding agent contract
│   │   ├── src/
│   │   │   ├── tools/           Tool implementations
│   │   │   ├── extensions/      Extension system
│   │   │   └── system-prompt.ts System prompt
│   │   └── test/
│   ├── ai/
│   │   ├── AGENTS.md            AI layer contract
│   │   ├── src/
│   │   │   ├── providers/       LLM providers
│   │   │   └── schema/          Type definitions
│   │   └── test/
│   └── session/
│       ├── AGENTS.md            Session contract
│       ├── src/
│       │   ├── session.ts       Session management
│       │   └── storage.ts       Persistence
│       └── test/
```

**Key patterns:**
- Each package has its own AGENTS.md
- Root AGENTS.md defines project-wide rules
- Child AGENTS.md files define module-specific rules
- Tests live next to their source code

### Example 2: OpenClaw Structure

```
openclaw/
├── AGENTS.md                    Root contract (36K!)
├── packages/
│   ├── agent-core/
│   │   ├── AGENTS.md            Agent core contract
│   │   ├── src/
│   │   │   ├── agent.ts         Agent logic
│   │   │   ├── agent-loop.ts    Agent loop
│   │   │   ├── harness/
│   │   │   │   ├── agent-harness.ts  Orchestration
│   │   │   │   ├── session/     Session management
│   │   │   │   └── compaction/  Context compaction
│   │   │   └── types.ts
│   │   └── test/
│   ├── llm-core/
│   │   ├── AGENTS.md            LLM layer contract
│   │   └── src/
│   │       ├── providers/       Provider implementations
│   │       └── schema/          Type definitions
│   ├── memory-host-sdk/
│   │   └── AGENTS.md            Memory SDK contract
│   └── ui/
│       └── AGENTS.md            UI contract
├── apps/
│   ├── android/
│   │   └── AGENTS.md            Android app contract
│   ├── ios/
│   │   └── AGENTS.md            iOS app contract
│   └── macos/
│       └── AGENTS.md            macOS app contract
```

**Key patterns:**
- Root AGENTS.md is 36K — comprehensive project-wide rules
- Each package has focused, module-specific rules
- Apps directory has platform-specific AGENTS.md files
- Agent-harness separation is documented in AGENTS.md

### Example 3: Aider Structure

```
aider/
├── AGENTS.md                    Root contract
├── aider/
│   ├── AGENTS.md                Main package contract
│   ├── coders/
│   │   ├── AGENTS.md            Coders contract
│   │   ├── base_coder.py        Base coder class
│   │   ├── editblock_coder.py   Edit block format
│   │   ├── wholefile_coder.py   Whole file format
│   │   ├── patch_coder.py       Patch format
│   │   └── architect_coder.py   Architect pattern
│   ├── models.py                Model management
│   ├── repo.py                  Git integration
│   ├── linter.py                Code linting
│   └── repomap.py               Repository map
├── tests/
│   ├── AGENTS.md                Test contract
│   ├── basic/
│   └── fixtures/
└── benchmark/
    └── AGENTS.md                Benchmark contract
```

**Key patterns:**
- Coders directory has its own AGENTS.md (complex module)
- Each coder type is a separate file with clear naming
- Tests mirror source structure
- Benchmarks have their own contract

---

## Agent-Specific Guidance

Different AI agents read configuration differently. Here's how each agent finds and uses AGENTS.md:

### Claude Code
```
Config file: CLAUDE.md (symlink to AGENTS.md)
Location: Project root
Reads: CLAUDE.md + parent chain
```
Claude Code reads CLAUDE.md from the project root. If you have AGENTS.md, create a symlink:
```bash
ln -s AGENTS.md CLAUDE.md
```

### OpenCode
```
Config file: .opencode/ directory
Location: Project root
Reads: .opencode/ config files
```
OpenCode uses its own config format. Map AGENTS.md sections to .opencode/ config.

### Cursor
```
Config file: .cursorrules
Location: Project root
Reads: .cursorrules file
```
Cursor reads .cursorrules. Create it from your AGENTS.md:
```bash
cp AGENTS.md .cursorrules
```

### Kilo Code
```
Config file: .kilocode/ directory
Location: Project root
Reads: .kilocode/skills/ and .kilocode/plans/
```
Kilo Code reads from .kilocode/ directory. Map AGENTS.md to .kilocode/ structure.

### OpenClaw
```
Config file: .agents/ directory
Location: Project root
Reads: .agents/ config files
```
OpenClaw reads from .agents/ directory. Map AGENTS.md to .agents/ structure.

### Hermes
```
Config file: AGENTS.md
Location: Project root + child directories
Reads: AGENTS.md chain directly
```
Hermes reads AGENTS.md directly. No symlink needed.

### Pi Agent
```
Config file: AGENTS.md
Location: Project root + package directories
Reads: AGENTS.md chain directly
```
Pi reads AGENTS.md directly from each package directory.

### GitHub Copilot
```
Config file: .github/copilot-instructions.md
Location: .github/ directory
Reads: .github/copilot-instructions.md
```
Copilot reads from .github/ directory. Create it from your AGENTS.md:
```bash
mkdir -p .github
cp AGENTS.md .github/copilot-instructions.md
```

### Universal Setup
For maximum compatibility, create all config files:
```bash
# Root AGENTS.md (source of truth)
# Then create symlinks/copies for each agent:
ln -s AGENTS.md CLAUDE.md
cp AGENTS.md .cursorrules
mkdir -p .github
cp AGENTS.md .github/copilot-instructions.md
```

---

## Validation Checklist

Use this to verify your AGENTS.md hierarchy is valid:

### Structure
- [ ] Root AGENTS.md exists at project root
- [ ] Root AGENTS.md has Purpose, Ownership, Work Guidance, Verification
- [ ] Root AGENTS.md has Child DOX Index listing all child AGENTS.md files
- [ ] Every child AGENTS.md is listed in its parent's Child DOX Index

### Completeness
- [ ] Every major directory (>10 files) has an AGENTS.md
- [ ] Every AGENTS.md has Purpose section
- [ ] Every AGENTS.md has Work Guidance section
- [ ] Child DOX Index is up to date (no missing entries, no stale entries)

### Consistency
- [ ] No conflicting rules between parent and child
- [ ] No duplicate rules across multiple AGENTS.md files
- [ ] Child rules don't weaken parent rules
- [ ] Terminology is consistent across all AGENTS.md files

### Freshness
- [ ] No references to deleted files or directories
- [ ] No references to old project structure
- [ ] Work Guidance reflects current tools and commands
- [ ] Verification commands actually work

---

## Anti-Patterns

### Anti-Pattern 1: "God AGENTS.md"
```
WHAT: One massive AGENTS.md for the entire project (1000+ lines)

WHY WRONG:
- Hard to maintain
- Hard for agents to find relevant rules
- Changes affect everything

SOLUTION: Split into hierarchy
├── AGENTS.md (200 lines) — project-wide rules
├── src/AGENTS.md (100 lines) — source code rules
├── src/tools/AGENTS.md (50 lines) — tools rules
└── tests/AGENTS.md (50 lines) — test rules
```

### Anti-Pattern 2: "Stale Rules"
```
WHAT: Rules that reference old structure, deleted files, or outdated commands

WHY WRONG:
- Agents follow wrong instructions
- Wasted time on non-existent paths
- Confusion about current state

SOLUTION: Regular audit
- Check AGENTS.md every time structure changes
- Remove references to deleted files
- Update commands when tools change
```

### Anti-Pattern 3: "Duplicate Rules"
```
WHAT: Same rule repeated in 5 different AGENTS.md files

WHY WRONG:
- Hard to update (must change 5 places)
- Easy to forget one copy
- Inconsistency over time

SOLUTION: Put rule in parent, reference from children
- Parent: "All code must pass linting"
- Child: "See parent AGENTS.md for linting rules"
```

### Anti-Pattern 4: "Missing Child"
```
WHAT: Large directory (>10 files) without its own AGENTS.md

WHY WRONG:
- No local contract for the module
- Agents don't know module-specific rules
- Hard to onboard new contributors

SOLUTION: Create child AGENTS.md with Purpose, Ownership, Work Guidance
```

### Anti-Pattern 5: "Conflicting Rules"
```
WHAT: Parent says "use TypeScript", child says "use JavaScript"

WHY WRONG:
- Agents don't know which rule to follow
- Inconsistent codebase
- Merge conflicts

SOLUTION: Child can specialize but not contradict parent
- Parent: "Use TypeScript for all new code"
- Child: "Legacy JavaScript files in this directory are OK"
- ❌ Child: "Use JavaScript instead" (contradicts parent)
```

### Anti-Pattern 6: "Diary Entries"
```
WHAT: AGENTS.md contains history, changelog, or temporary notes

WHY WRONG:
- AGENTS.md is a contract, not a diary
- Stale notes confuse agents
- File grows forever

SOLUTION: Use CHANGELOG.md for history, AGENTS.md for contracts
- ❌ "On 2024-01-15, we switched from REST to GraphQL"
- ✅ "API uses GraphQL (see src/api/schema.graphql)"
```

---

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

---

## Closeout

Before finishing any task:

1. Re-check changed paths against the Hera chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

---

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.
