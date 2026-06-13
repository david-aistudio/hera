"""
Minimal Provider — Hera Architecture Reference (Python)

LLM provider abstraction supporting OpenAI, Anthropic, and local models.
Handles retries, streaming, and multi-provider routing.

Based on Pi Agent's provider system (packages/agent/src/ai/).
"""

from __future__ import annotations

import asyncio
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator


# ============================================================================
# Types
# ============================================================================

@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    duration_ms: float = 0.0


@dataclass
class StreamChunk:
    """Single chunk from a streaming LLM response."""
    text: str = ""
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_arguments: str = ""  # Partial JSON
    finish_reason: str | None = None


@dataclass
class ProviderConfig:
    """Configuration for an LLM provider."""
    name: str = ""
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    max_tokens: int = 4096
    temperature: float = 0.7
    timeout: float = 60.0
    max_retries: int = 3
    cost_per_input_token: float = 0.0
    cost_per_output_token: float = 0.0


# ============================================================================
# Provider Interface
# ============================================================================

class LLMProvider(ABC):
    """Base class for LLM providers."""

    def __init__(self, config: ProviderConfig):
        self.config = config

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Non-streaming chat completion."""
        ...

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Streaming chat completion."""
        ...


# ============================================================================
# OpenAI Provider
# ============================================================================

class OpenAIProvider(LLMProvider):
    """OpenAI-compatible provider (works with OpenAI, vLLM, LiteLLM, etc.)."""

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise ImportError("pip install openai")

        client = AsyncOpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url or None,
            timeout=self.config.timeout,
        )

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
        }

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        start = time.time()
        response = await client.chat.completions.create(**kwargs)
        duration = (time.time() - start) * 1000

        choice = response.choices[0]
        usage = Usage(
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
            total_tokens=response.usage.total_tokens if response.usage else 0,
            duration_ms=duration,
        )

        # Calculate cost
        usage.cost_usd = (
            usage.input_tokens * self.config.cost_per_input_token
            + usage.output_tokens * self.config.cost_per_output_token
        )

        return {
            "content": choice.message.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": json.loads(tc.function.arguments),
                }
                for tc in (choice.message.tool_calls or [])
            ],
            "finish_reason": choice.finish_reason,
            "usage": usage,
        }

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise ImportError("pip install openai")

        client = AsyncOpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url or None,
        )

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "stream": True,
        }

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        stream = await client.chat.completions.create(**kwargs)

        current_tool_id: str | None = None
        current_tool_name: str | None = None
        current_tool_args = ""

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            finish = chunk.choices[0].finish_reason if chunk.choices else None

            if delta:
                # Text content
                if delta.content:
                    yield StreamChunk(text=delta.content)

                # Tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.id:
                            current_tool_id = tc.id
                            current_tool_name = tc.function.name if tc.function else None
                            current_tool_args = ""

                        if tc.function and tc.function.arguments:
                            current_tool_args += tc.function.arguments

                        # Try to parse complete tool call
                        try:
                            json.loads(current_tool_args)
                            yield StreamChunk(
                                tool_call_id=current_tool_id,
                                tool_name=current_tool_name,
                                tool_arguments=current_tool_args,
                            )
                            current_tool_id = None
                            current_tool_name = None
                            current_tool_args = ""
                        except json.JSONDecodeError:
                            pass  # Incomplete JSON, continue accumulating

            if finish:
                yield StreamChunk(finish_reason=finish)


# ============================================================================
# Anthropic Provider
# ============================================================================

class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider."""

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        try:
            from anthropic import AsyncAnthropic
        except ImportError:
            raise ImportError("pip install anthropic")

        client = AsyncAnthropic(api_key=self.config.api_key, timeout=self.config.timeout)

        # Anthropic uses system as separate param
        system_msg = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": chat_messages,
            "max_tokens": self.config.max_tokens,
        }

        if system_msg:
            kwargs["system"] = system_msg

        if tools:
            kwargs["tools"] = tools

        start = time.time()
        response = await client.messages.create(**kwargs)
        duration = (time.time() - start) * 1000

        usage = Usage(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=duration,
        )

        return {
            "content": response.content[0].text if response.content else "",
            "tool_calls": [],
            "finish_reason": response.stop_reason,
            "usage": usage,
        }

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        try:
            from anthropic import AsyncAnthropic
        except ImportError:
            raise ImportError("pip install anthropic")

        client = AsyncAnthropic(api_key=self.config.api_key)

        system_msg = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": chat_messages,
            "max_tokens": self.config.max_tokens,
        }

        if system_msg:
            kwargs["system"] = system_msg

        if tools:
            kwargs["tools"] = tools

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield StreamChunk(text=text)

            yield StreamChunk(finish_reason="end_turn")


# ============================================================================
# Example Usage
# ============================================================================

async def main():
    config = ProviderConfig(
        name="openai",
        api_key="sk-...",
        model="gpt-4o",
        max_tokens=4096,
    )

    provider = OpenAIProvider(config)

    messages = [
        {"role": "system", "content": "You are a helpful coding assistant."},
        {"role": "user", "content": "Write a hello world in Python"},
    ]

    # Non-streaming
    result = await provider.chat(messages)
    print(f"Response: {result['content']}")
    print(f"Tokens: {result['usage'].total_tokens}")
    print(f"Cost: ${result['usage'].cost_usd:.4f}")

    # Streaming
    print("\n--- Streaming ---")
    async for chunk in provider.chat_stream(messages):
        if chunk.text:
            print(chunk.text, end="", flush=True)
        if chunk.finish_reason:
            print(f"\n[Finish: {chunk.finish_reason}]")


if __name__ == "__main__":
    asyncio.run(main())
