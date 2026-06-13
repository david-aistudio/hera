"""
Minimal Harness — Hera Architecture Reference (Python)

Agent harness: the top-level orchestrator that wires everything together.
Manages agent lifecycle, tool registration, extension loading, and session handling.

Based on Pi Agent's agent-harness.ts (packages/agent/src/agent-harness.ts).
"""

from __future__ import annotations

import asyncio
import signal
import sys
from dataclasses import dataclass, field
from typing import Any

from minimal_agent_loop import AgentContext, Message, TextContent, agent_loop
from minimal_extension import Extension, ExtensionManager, HookPoint
from minimal_provider import LLMProvider, OpenAIProvider, ProviderConfig
from minimal_session import InMemoryStorage, Session
from minimal_tool import BaseTool, ToolRegistry


# ============================================================================
# Config
# ============================================================================

@dataclass
class AgentConfig:
    """Configuration for the agent harness."""
    name: str = "my-agent"
    system_prompt: str = "You are a helpful coding assistant."
    max_context_tokens: int = 128000
    max_tool_retries: int = 3
    log_level: str = "info"


# ============================================================================
# Agent Harness
# ============================================================================

class AgentHarness:
    """
    Top-level orchestrator. Wires together:
    - LLM Provider (OpenAI/Anthropic/local)
    - Tools (read, write, bash, etc.)
    - Extensions (logging, security, timing)
    - Session (history, branching, persistence)
    """

    def __init__(self, config: AgentConfig, provider: LLMProvider):
        self.config = config
        self.provider = provider
        self.tools = ToolRegistry()
        self.extensions = ExtensionManager()
        self.session = Session(
            storage=InMemoryStorage(),
            max_context_tokens=config.max_context_tokens,
        )
        self._running = False
        self._abort_controller = asyncio.Event()

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register_tool(self, tool: BaseTool) -> None:
        """Register a tool."""
        self.tools.register(tool)

    def register_extension(self, ext: Extension) -> None:
        """Register an extension."""
        self.extensions.register(ext)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the agent."""
        self._running = True
        self._abort_controller.clear()

        # Signal handlers
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, self._handle_signal)

        self.extensions.execute_hook(HookPoint.ON_START)
        print(f"[{self.config.name}] Agent started")

    async def stop(self) -> None:
        """Stop the agent gracefully."""
        self._running = False
        self._abort_controller.set()
        self.extensions.execute_hook(HookPoint.ON_STOP)
        print(f"[{self.config.name}] Agent stopped")

    def _handle_signal(self, signum: int, frame: Any) -> None:
        """Handle shutdown signals."""
        print(f"\n[{self.config.name}] Received signal {signum}, shutting down...")
        asyncio.get_event_loop().create_task(self.stop())

    # ------------------------------------------------------------------
    # Core Execution
    # ------------------------------------------------------------------

    async def run(self, user_input: str) -> str:
        """
        Process a single user input through the full agent loop.

        Flow:
        1. Add user message to session
        2. Build context from session history
        3. Run agent loop (LLM → tools → LLM → ...)
        4. Return final assistant response
        """
        if not self._running:
            await self.start()

        # 1. Record user message
        self.session.append_message("user", user_input)

        # 2. Build context
        messages = self.session.build_context(self.config.system_prompt)

        # 3. Pre-LLM hook
        self.extensions.execute_hook(HookPoint.BEFORE_LLM, {"messages": messages})

        # 4. Build agent context
        context = AgentContext(
            system_prompt=self.config.system_prompt,
            messages=[Message(role=m["role"], content=[TextContent(text=m["content"])]) for m in messages],
            tools=[],  # Tools are handled via the registry
        )

        # 5. Run agent loop
        new_messages = agent_loop(context)

        # 6. Record assistant messages
        final_response = ""
        for msg in new_messages:
            if msg.role == "assistant":
                for part in msg.content:
                    if isinstance(part, TextContent):
                        self.session.append_message("assistant", part.text)
                        final_response = part.text

        # 7. Post-LLM hook
        self.extensions.execute_hook(HookPoint.AFTER_LLM, {"response": final_response})

        return final_response

    async def run_interactive(self) -> None:
        """Run in interactive mode (stdin/stdout)."""
        await self.start()

        print(f"\n{self.config.name} — Interactive Mode")
        print("Type 'quit' to exit, 'history' to see conversation\n")

        while self._running:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not user_input:
                continue

            if user_input.lower() == "quit":
                break

            if user_input.lower() == "history":
                history = self.session.get_history()
                for entry in history:
                    data = entry.data
                    print(f"  [{entry.type.value}] {data.get('content', data)}")
                continue

            response = await self.run(user_input)
            print(f"Agent: {response}\n")

        await self.stop()

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """Get current agent state."""
        return {
            "config": {
                "name": self.config.name,
                "system_prompt": self.config.system_prompt[:100] + "...",
            },
            "tools": self.tools.list_tools(),
            "extensions": self.extensions.list_extensions(),
            "session": self.session.get_checkpoint(),
            "running": self._running,
        }


# ============================================================================
# Example Usage
# ============================================================================

async def main():
    # Create agent
    config = AgentConfig(
        name="my-agent",
        system_prompt="You are a helpful coding assistant. Use tools to read and write files.",
    )

    provider_config = ProviderConfig(
        name="openai",
        api_key="sk-...",
        model="gpt-4o",
    )

    harness = AgentHarness(config=config, provider=OpenAIProvider(provider_config))

    # Register tools
    from minimal_tool import ReadFileTool, WriteFileTool
    harness.register_tool(ReadFileTool())
    harness.register_tool(WriteFileTool())

    # Register extensions
    from minimal_extension import LoggingExtension, TimingExtension
    harness.register_extension(LoggingExtension())
    harness.register_extension(TimingExtension())

    # Print state
    import json
    print("=== Agent State ===")
    print(json.dumps(harness.get_state(), indent=2, default=str))

    # Run interactive
    await harness.run_interactive()


if __name__ == "__main__":
    asyncio.run(main())
