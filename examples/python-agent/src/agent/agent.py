"""
Agent — stateful wrapper around the agent loop.

Manages conversation state, steering queue, and session persistence.
Based on Pi Agent's agent.ts.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from .loop import AgentLoop
from .types import AgentEvent, Message, TextContent


class Agent:
    """
    Stateful agent with queue-based steering.

    Features:
    - Conversation history
    - Steering queue (inject messages mid-run)
    - Session persistence
    - Extension hooks
    """

    def __init__(
        self,
        provider: Any,
        tools: dict[str, Any],
        system_prompt: str = "You are a helpful coding assistant.",
        session: Any = None,
        extensions: list[Any] | None = None,
        on_event: Callable[[AgentEvent], None] | None = None,
    ):
        self.provider = provider
        self.tools = tools
        self.system_prompt = system_prompt
        self.session = session
        self.extensions = extensions or []
        self.on_event = on_event or (lambda e: None)

        self._messages: list[Message] = []
        self._steering_queue: asyncio.Queue[Message] = asyncio.Queue()
        self._running = False

    @property
    def messages(self) -> list[Message]:
        return self._messages.copy()

    async def send(self, user_input: str) -> str:
        """
        Send a message and get a response.

        This is the main entry point for interacting with the agent.
        """
        # Create user message
        user_msg = Message(role="user", content=[TextContent(text=user_input)])
        self._messages.append(user_msg)

        # Save to session
        if self.session:
            self.session.append_message("user", user_input)

        # Run agent loop
        self._running = True
        loop = AgentLoop(
            provider=self.provider,
            tools=self.tools,
            system_prompt=self.system_prompt,
            on_event=self.on_event,
        )

        try:
            new_messages = await loop.run(self._messages)
            self._messages.extend(new_messages)

            # Save to session
            if self.session:
                for msg in new_messages:
                    if msg.role == "assistant":
                        for part in msg.content:
                            if isinstance(part, TextContent):
                                self.session.append_message("assistant", part.text)

            # Return final response
            final_text = ""
            for msg in reversed(new_messages):
                if msg.role == "assistant":
                    for part in msg.content:
                        if isinstance(part, TextContent):
                            final_text = part.text
                            break
                    if final_text:
                        break

            return final_text

        finally:
            self._running = False

    async def steer(self, message: str) -> None:
        """Inject a message while the agent is running (steering queue)."""
        if self._running:
            await self._steering_queue.put(
                Message(role="user", content=[TextContent(text=message)])
            )

    def get_history(self) -> list[dict[str, str]]:
        """Get conversation history as simple dicts."""
        history = []
        for msg in self._messages:
            text = ""
            for part in msg.content:
                if isinstance(part, TextContent):
                    text += part.text
            if text:
                history.append({"role": msg.role, "content": text})
        return history

    def clear(self) -> None:
        """Clear conversation history."""
        self._messages.clear()

    def set_system_prompt(self, prompt: str) -> None:
        """Update system prompt."""
        self.system_prompt = prompt
