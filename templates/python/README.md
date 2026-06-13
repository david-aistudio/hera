# Hera Python Templates

Production-ready Python templates for building AI coding agents, based on Pi Agent's architecture.

## Templates

| Template | Description | Lines |
|----------|-------------|-------|
| `minimal_agent_loop.py` | Core agent loop — call LLM, check tools, execute, repeat | ~200 |
| `minimal_provider.py` | LLM provider abstraction (OpenAI, Anthropic, streaming) | ~300 |
| `minimal_tool.py` | Tool definition, validation, execution, registry | ~280 |
| `minimal_session.py` | Session management, branching, persistence, context windows | ~300 |
| `minimal_extension.py` | Plugin/extension system with lifecycle hooks | ~350 |
| `minimal_harness.py` | Top-level orchestrator wiring everything together | ~250 |

## Quick Start

```python
from templates.python.minimal_harness import AgentHarness, AgentConfig
from templates.python.minimal_provider import OpenAIProvider, ProviderConfig
from templates.python.minimal_tool import ReadFileTool, WriteFileTool
from templates.python.minimal_extension import LoggingExtension, TimingExtension

# Create agent
config = AgentConfig(
    name="my-agent",
    system_prompt="You are a helpful coding assistant.",
)

provider = OpenAIProvider(ProviderConfig(
    api_key="sk-...",
    model="gpt-4o",
))

harness = AgentHarness(config=config, provider=provider)

# Register tools
harness.register_tool(ReadFileTool())
harness.register_tool(WriteFileTool())

# Register extensions
harness.register_extension(LoggingExtension())
harness.register_extension(TimingExtension())

# Run
import asyncio
asyncio.run(harness.run_interactive())
```

## Architecture

```
AgentHarness (orchestrator)
├── LLMProvider (OpenAI/Anthropic/local)
├── ToolRegistry (read, write, bash, etc.)
├── ExtensionManager (logging, security, timing)
└── Session (history, branching, persistence)
```

## Production Patterns

See `docs/` for production-ready patterns:
- `PATTERNS.md` — Circuit breaker, rate limiter, health checks
- `STREAMING.md` — SSE, WebSocket, chunked responses
- `MEMORY.md` — Token counting, context windows, compression
- `ROUTING.md` — Multi-model routing, fallback chains, cost optimization
