"""OpenAI provider with streaming support."""

from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator

from ..agent.types import LLMResponse, TextContent, ToolCallContent, Usage


class OpenAIProvider:
    """OpenAI-compatible provider (works with OpenAI, vLLM, LiteLLM)."""

    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str | None = None):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self._client = None

    @property
    def name(self) -> str:
        return "openai"

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        client = self._get_client()

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 4096,
        }

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        start = time.time()
        response = await client.chat.completions.create(**kwargs)
        duration_ms = (time.time() - start) * 1000

        choice = response.choices[0]

        # Parse content
        content_parts: list[Any] = []
        if choice.message.content:
            content_parts.append(TextContent(text=choice.message.content))

        # Parse tool calls
        for tc in (choice.message.tool_calls or []):
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}
            content_parts.append(ToolCallContent(
                id=tc.id,
                name=tc.function.name,
                arguments=args,
            ))

        usage = Usage(
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
            total_tokens=response.usage.total_tokens if response.usage else 0,
            duration_ms=duration_ms,
        )

        return LLMResponse(
            content=content_parts,
            stop_reason=choice.finish_reason or "end_turn",
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

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 4096,
            "stream": True,
        }

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        stream = await client.chat.completions.create(**kwargs)

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content
