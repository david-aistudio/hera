<p align="center">
  <img src="assets/hera-logo.jpg" width="280" alt="Hera — Queen of the Gods">
</p>

<h1 align="center">𝐻𝐸𝑅𝐴</h1>

<p align="center">
  <em>Queen of the Gods · Mother of Agents · Architect of Intelligence</em>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Version-1.0.0-1a1a2e?style=flat-square&labelColor=1a1a2e&color=d4af37" alt="Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-1a1a2e?style=flat-square&labelColor=1a1a2e&color=d4af37" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/Agents-18+-1a1a2e?style=flat-square&labelColor=1a1a2e&color=d4af37" alt="Agents"></a>
  <a href="#"><img src="https://img.shields.io/badge/Sections-19-1a1a2e?style=flat-square&labelColor=1a1a2e&color=d4af37" alt="Sections"></a>
  <a href="#"><img src="https://img.shields.io/badge/Lines-5000+-1a1a2e?style=flat-square&labelColor=1a1a2e&color=d4af37" alt="Lines"></a>
</p>

<p align="center">
  <a href="#-installation">Install</a> · <a href="#-architecture">Architecture</a> · <a href="#-supported-agents">Agents</a> · <a href="#-documentation">Docs</a>
</p>

---

## Ἡρα · What is Hera?

> *"In the beginning, there was chaos. Then came Hera — and from her throne, she ordered the world of intelligence."*

**Hera** is a **complete architectural reference** for building **production-grade AI coding agents**. Every line of code, every pattern, every design decision is **verified from source** — not guesswork, not documentation, but the **living blueprint** of a 62,000-star TypeScript monorepo.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "Build not what is easy. Build what is eternal."         │
│                                        — Hera, §16.3        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Ο Θρόνος · The Throne

<p align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <strong>🏛 Agent Loop</strong><br>
        <sub>Two-loop design<br>Steering + Follow-up</sub>
      </td>
      <td align="center" width="25%">
        <strong>🌿 Session Tree</strong><br>
        <sub>Branching, forking<br>Not linear logs</sub>
      </td>
      <td align="center" width="25%">
        <strong>⚡ Compaction</strong><br>
        <sub>Auto-summarize<br>Context management</sub>
      </td>
      <td align="center" width="25%">
        <strong>🔱 Extensions</strong><br>
        <sub>Full plugin system<br>Lifecycle hooks</sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="25%">
        <strong>📡 Streaming</strong><br>
        <sub>Real-time events<br>SSE + WebSocket</sub>
      </td>
      <td align="center" width="25%">
        <strong>🌍 20+ Providers</strong><br>
        <sub>OpenAI, Anthropic<br>Google, & more</sub>
      </td>
      <td align="center" width="25%">
        <strong>🛡 TypeBox</strong><br>
        <sub>Schema validation<br>Type-safe tools</sub>
      </td>
      <td align="center" width="25%">
        <strong>🎯 7 Tools</strong><br>
        <sub>read, write, edit<br>bash, grep, find, ls</sub>
      </td>
    </tr>
  </table>
</p>

---

## Αρχιτεκτονική · Architecture

```
                           ┌──────────────┐
                           │  User Input  │
                           └──────┬───────┘
                                  │
                           ┌──────▼───────┐
                           │   Harness    │
                           │   .prompt()  │
                           └──────┬───────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │    executeTurn()           │
                    │  ┌───────────────────────┐ │
                    │  │ before_agent_start    │ │
                    │  │ (inject messages,     │ │
                    │  │  override prompt)     │ │
                    │  └───────────┬───────────┘ │
                    │              │              │
                    │  ┌───────────▼───────────┐ │
                    │  │     Agent Loop        │ │
                    │  │  ┌─────────────────┐  │ │
                    │  │  │ Outer Loop      │  │ │
                    │  │  │ (follow-up)     │  │ │
                    │  │  │ ┌─────────────┐ │  │ │
                    │  │  │ │ Inner Loop  │ │  │ │
                    │  │  │ │ (steering)  │ │  │ │
                    │  │  │ │             │ │  │ │
                    │  │  │ │ 1. LLM Call │ │  │ │
                    │  │  │ │ 2. Stream   │ │  │ │
                    │  │  │ │ 3. Tools    │ │  │ │
                    │  │  │ │ 4. Repeat   │ │  │ │
                    │  │  │ └─────────────┘ │  │ │
                    │  │  └─────────────────┘  │ │
                    │  └───────────────────────┘ │
                    └───────────────────────────┘
```

---

## Υποστηριζόμενοι Πράκτορες · Supported Agents

<p align="center">
  <table>
    <tr>
      <th>Agent</th>
      <th>Config</th>
      <th>Status</th>
    </tr>
    <tr><td>Claude Code</td><td><code>CLAUDE.md</code></td><td>✅</td></tr>
    <tr><td>Hermes</td><td><code>~/.hermes/skills/hera/</code></td><td>✅</td></tr>
    <tr><td>OpenCode</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>Codex</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>Cursor</td><td><code>.cursor/rules/hera.mdc</code></td><td>✅</td></tr>
    <tr><td>Antigravity</td><td><code>.agents/rules/</code></td><td>✅</td></tr>
    <tr><td>Pi</td><td><code>~/.pi/agent/skills/hera/</code></td><td>✅</td></tr>
    <tr><td>Gemini</td><td><code>GEMINI.md</code></td><td>✅</td></tr>
    <tr><td>Aider</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>Copilot</td><td><code>~/.copilot/skills/</code></td><td>✅</td></tr>
    <tr><td>Amp</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>Kilo</td><td><code>.kilo/skills/</code></td><td>✅</td></tr>
    <tr><td>Kiro</td><td><code>.kiro/skills/</code></td><td>✅</td></tr>
    <tr><td>Devin</td><td><code>~/.config/devin/skills/</code></td><td>✅</td></tr>
    <tr><td>Trae</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>CodeBuddy</td><td><code>CODEBUDDY.md</code></td><td>✅</td></tr>
    <tr><td>OpenClaw</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
    <tr><td>Factory Droid</td><td><code>AGENTS.md</code></td><td>✅</td></tr>
  </table>
</p>

---

## Εγκατάσταση · Installation

```bash
# Clone the throne
git clone https://github.com/david-aistudio/hera.git
cd hera

# Install for your agent
./install.sh claude        # Claude Code
./install.sh hermes        # Hermes Agent
./install.sh opencode      # OpenCode
./install.sh cursor        # Cursor
./install.sh all           # All detected agents
```

---

## Τεκμηρίωση · Documentation

### The 19 Sacred Sections

| § | Section | What You Learn |
|---|---------|----------------|
| I | **Package Structure** | 4 packages, dependency flow |
| II | **Core Types** | AgentMessage, AgentState, AgentTool, AgentEvent |
| III | **Agent Loop** | Two-loop design, streaming, tool execution |
| IV | **Agent Class** | Stateful wrapper, queueing, lifecycle |
| V | **Agent Harness** | Orchestration, hooks, turn execution |
| VI | **Session System** | Tree-based storage, branching |
| VII | **Compaction** | Auto-summarize old messages |
| VIII | **Message Conversion** | convertToLlm, custom types |
| IX | **Tool System** | 7 built-in tools, factory pattern |
| X | **Extension System** | Full plugin system, UI, events |
| XI | **AI Layer** | 20+ providers, streaming |
| XII | **System Prompt** | Structure, context, skills |
| XIII | **Skills & Templates** | Loading, format, invocation |
| XIV | **Event Architecture** | Full event flow diagram |
| XV | **Design Patterns** | 8 patterns explained |
| XVI | **Implementation Guide** | Step-by-step build order |
| XVII | **Pitfalls** | 8 critical gotchas |
| XVIII | **File Reference** | All source files |
| XIX | **Comparison** | Hera vs other agents |

### Quick Start

```
§1-6   → Core architecture (must read)
§7-13  → Advanced features
§14-15 → Patterns & events
§16    → Build your own agent
§17    → Avoid mistakes
§18-19 → Reference & comparison
```

---

## Σύγκριση · Comparison

| Feature | **Hera** | Claude Code | OpenCode | Cursor | Codex |
|---|---|---|---|---|---|
| **Agent Loop** | Two-loop | Single | Single | Single | Single |
| **Session** | Tree-based | Linear | SQLite | Linear | Linear |
| **Compaction** | Built-in | Manual | Manual | Manual | Manual |
| **Extensions** | Full plugin | Hooks | Plugins | Rules | Rules |
| **Providers** | 20+ | 1 | Multi | Multi | 1 |
| **Steering** | Queue-based | ❌ | ❌ | ❌ | ❌ |
| **Open Source** | ✅ MIT | ❌ | ✅ MIT | ❌ | ❌ |

---

## Σχεδιαστικά Μοτίβα · Design Patterns

```
╔══════════════════════════════════════════════════════════╗
║  1. Immutable Snapshots     → Slice/copy before turn    ║
║  2. Queue-Based Steering    → Inject without interrupt  ║
║  3. Tree-Based Sessions     → Branch, fork, navigate    ║
║  4. Compaction              → Auto-summarize old msgs   ║
║  5. TypeBox Schemas         → Type-safe tool params     ║
║  6. Provider Abstraction    → Same API, 20+ providers   ║
║  7. Extension System        → Full plugin lifecycle     ║
║  8. Declaration Merging     → Custom types, no modify   ║
╚══════════════════════════════════════════════════════════╝
```

---

## Κρίσιμα Αναλλοίωτα · Critical Invariants

```
┌────────────────────────────────────────────────────────────┐
│  I.   convertToLlm must NEVER throw — safe fallback       │
│  II.  Context snapshots must be IMMUTABLE — always copy   │
│  III. Tool execution must respect ABORT SIGNAL             │
│  IV.  Events emitted IN ORDER — listeners await sequentially│
│  V.   Session writes are BATCHED — flushed at turn_end    │
│  VI.  Queue drain respects QUEUE MODE                      │
│  VII. Compaction preserves RECENT CONTEXT                  │
│  VIII.Tool termination requires ALL results true           │
└────────────────────────────────────────────────────────────┘
```

---

## Αριθμοί · Stats

<p align="center">
  <table>
    <tr>
      <td align="center"><strong>18</strong><br><sub>Sections</sub></td>
      <td align="center"><strong>5000+</strong><br><sub>Lines</sub></td>
      <td align="center"><strong>20+</strong><br><sub>Providers</sub></td>
      <td align="center"><strong>18</strong><br><sub>Agents</sub></td>
      <td align="center"><strong>8</strong><br><sub>Patterns</sub></td>
      <td align="center"><strong>8</strong><br><sub>Pitfalls</sub></td>
      <td align="center"><strong>7</strong><br><sub>Tools</sub></td>
      <td align="center"><strong>748</strong><br><sub>Core Loop Lines</sub></td>
    </tr>
  </table>
</p>

---

## Ευγνωμοσύνη · Acknowledgments

- [**Pi Agent**](https://github.com/earendil-works/pi) — Architecture reference (62K stars)
- [**Graphify**](https://github.com/safishamsi/graphify) — Code analysis tool
- All AI coding agents that inspired this project

---

## Άδεια · License

**MIT License** — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <img src="assets/hera-logo.jpg" width="120" alt="Hera">
</p>

<p align="center">
  <em>"From chaos, order. From code, intelligence. From Hera, architecture."</em>
</p>

<p align="center">
  <b>Built with ❤️ by <a href="https://github.com/david-aistudio">david-aistudio</a></b>
</p>
