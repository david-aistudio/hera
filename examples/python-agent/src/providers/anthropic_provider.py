"""Anthropic Claude provider with streaming support."""

from __future__ import annotations

import time
from typing import Any, AsyncIterator

from ..agent.types import LLMResponse, TextContent, Usage


class AnthropicProvider:
    """Anthropic Claude provider."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model
        self._client = None

    @property
    def name(self) -> str:
        return "anthropic"

    def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self.api_key)
        return self._client

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        client = self._get_client()

        # Anthropic uses system as separate param
        system_msg = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": chat_messages,
            "max_tokens": 4096,
        }

        if system_msg:
            kwargs["system"] = system_msg

        if tools:
            kwargs["tools"] = tools

        start = time.time()
        response = await client.messages.create(**kwargs)
        duration_ms = (time.time() - start) * 1000

        content_parts: list[Any] = []
        for block in response.content:
            if hasattr(block, "text"):
                content_parts.append(TextContent(text=block.text))

        usage = Usage(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            duration_ms=duration_ms,
        )

        return LLMResponse(
            content=content_parts,
            stop_reason=response.stop_reason or "end_turn",
            usage=usage,
            model=self.model,
            provider=self.name,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        client = self._get_client()

        system_msg = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": chat_messages,
            "max_tokens": 4096,
        }

        if system_msg:
            kwargs["system"] = system_msg

        if tools:
            kwargs["tools"] = tools

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
