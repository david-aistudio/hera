"""
Entry point — interactive CLI for the Hera Python Example Agent.

Usage:
    python -m src.main                          # Interactive mode
    python -m src.main --message "Hello"        # Single message
    python -m src.main --provider anthropic     # Use Anthropic
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from .agent.agent import Agent
from .agent.types import AgentEvent, EventType
from .extensions.logging import LoggingExtension
from .extensions.security import SecurityExtension
from .extensions.timing import TimingExtension
from .session.session import Session
from .session.storage import JsonFileStorage
from .tools.bash import BashTool
from .tools.read_file import ReadFileTool
from .tools.registry import ToolRegistry
from .tools.write_file import WriteFileTool


def create_provider(provider_name: str, api_key: str, model: str, base_url: str | None = None):
    """Create an LLM provider."""
    if provider_name == "anthropic":
        from .providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=api_key, model=model)
    else:
        from .providers.openai_provider import OpenAIProvider
        return OpenAIProvider(api_key=api_key, model=model, base_url=base_url)


def build_agent(args: argparse.Namespace) -> Agent:
    """Build the agent with all components."""
    # Provider
    api_key = args.api_key or os.environ.get("HERA_API_KEY", "")
    if not api_key:
        print("Error: set HERA_API_KEY or pass --api-key")
        sys.exit(1)

    model = args.model or os.environ.get("HERA_MODEL", "gpt-4o")
    base_url = args.base_url or os.environ.get("HERA_BASE_URL")
    provider_name = args.provider or os.environ.get("HERA_PROVIDER", "openai")

    provider = create_provider(provider_name, api_key, model, base_url)

    # Tools
    registry = ToolRegistry()
    registry.register(ReadFileTool())
    registry.register(WriteFileTool())
    registry.register(BashTool())

    # Extensions
    log_level = os.environ.get("HERA_LOG_LEVEL", "info")
    logging_ext = LoggingExtension(level=log_level)
    security_ext = SecurityExtension()
    timing_ext = TimingExtension()

    # Session
    session_dir = os.environ.get("HERA_SESSION_DIR", ".sessions")
    session = Session(storage=JsonFileStorage(session_dir))

    # Agent
    agent = Agent(
        provider=provider,
        tools=registry.as_dict(),
        system_prompt="You are a helpful coding assistant. Use tools to read and write files, and execute shell commands. Always explain what you are doing.",
        session=session,
        extensions=[logging_ext, security_ext, timing_ext],
        on_event=lambda e: logging_ext.on_event(e),
    )

    return agent


async def interactive_mode(agent: Agent) -> None:
    """Run in interactive mode."""
    print("\n🤖 Hera Python Example Agent")
    print("Type 'quit' to exit, 'history' to see conversation, 'stats' for timing\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not user_input:
            continue

        if user_input.lower() == "quit":
            print("Bye!")
            break

        if user_input.lower() == "history":
            for entry in agent.get_history():
                role = entry["role"]
                content = entry["content"][:100]
                print(f"  [{role}] {content}")
            continue

        if user_input.lower() == "stats":
            # Print timing stats from extensions
            for ext in agent.extensions:
                if hasattr(ext, "summary"):
                    print(ext.summary())
            continue

        response = await agent.send(user_input)
        print(f"\nAgent: {response}\n")


async def single_message_mode(agent: Agent, message: str) -> None:
    """Send a single message and print the response."""
    response = await agent.send(message)
    print(response)


def main():
    parser = argparse.ArgumentParser(description="Hera Python Example Agent")
    parser.add_argument("--provider", choices=["openai", "anthropic"], help="LLM provider")
    parser.add_argument("--api-key", help="API key")
    parser.add_argument("--model", help="Model name")
    parser.add_argument("--base-url", help="Custom API base URL")
    parser.add_argument("--message", "-m", help="Send a single message (non-interactive)")

    args = parser.parse_args()

    agent = build_agent(args)

    if args.message:
        asyncio.run(single_message_mode(agent, args.message))
    else:
        asyncio.run(interactive_mode(agent))


if __name__ == "__main__":
    main()
