# Hera Python Example Agent

A complete AI coding agent demonstrating Hera Framework patterns in Python.

## Architecture

```
AgentHarness (orchestrator)
├── Agent (stateful wrapper)
│   └── AgentLoop (call LLM → execute tools → repeat)
├── Tools
│   ├── ReadFileTool
│   ├── WriteFileTool
│   └── BashTool
├── Extensions
│   ├── LoggingExtension
│   ├── SecurityExtension
│   └── TimingExtension
├── Session
│   ├── InMemoryStorage
│   └── JsonFileStorage
└── Providers
    ├── OpenAIProvider
    └── AnthropicProvider
```

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Run interactive mode
python -m src.main

# Run with specific provider
HERA_PROVIDER=openai HERA_API_KEY=sk-... python -m src.main
HERA_PROVIDER=anthropic HERA_API_KEY=sk-ant-... python -m src.main

# Run tests
pytest
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HERA_PROVIDER` | `openai` | LLM provider (`openai` or `anthropic`) |
| `HERA_API_KEY` | (required) | API key for the provider |
| `HERA_MODEL` | `gpt-4o` | Model to use |
| `HERA_BASE_URL` | (provider default) | Custom API base URL |
| `HERA_LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warning`, `error`) |
| `HERA_SESSION_DIR` | `.sessions` | Directory for session persistence |

## Files

| File | Purpose |
|---|---|
| `src/main.py` | Entry point, CLI, interactive mode |
| `src/agent/types.py` | Core types (Message, Tool, Provider) |
| `src/agent/loop.py` | Agent loop (LLM → tools → repeat) |
| `src/agent/agent.py` | Stateful agent with queue-based steering |
| `src/tools/read_file.py` | Read file tool |
| `src/tools/write_file.py` | Write file tool |
| `src/tools/bash.py` | Execute shell commands |
| `src/tools/registry.py` | Tool registry with validation |
| `src/session/storage.py` | In-memory + JSON file storage |
| `src/session/session.py` | Session with branching and context windows |
| `src/extensions/logging.py` | Structured logging extension |
| `src/extensions/security.py` | Command/file security extension |
| `src/extensions/timing.py` | Performance timing extension |
| `src/providers/openai_provider.py` | OpenAI provider with streaming |
| `src/providers/anthropic_provider.py` | Anthropic provider with streaming |
| `tests/test_agent.py` | Unit tests |
