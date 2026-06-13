"""
Minimal Agent Loop — Hera Architecture Reference (Python)

Python implementation of the core agent loop pattern.
Call LLM → check for tools → execute → repeat.

Based on Pi Agent's agent-loop.ts architecture.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol


# ============================================================================
# Types
# ============================================================================

@dataclass
class TextContent:
    type: str = "text"
    text: str = ""


@dataclass
class ToolCallContent:
    type: str = "toolCall"
    id: str = ""
    name: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResultContent:
    type: str = "toolResult"
    tool_call_id: str = ""
    content: list[TextContent] = field(default_factory=list)
    is_error: bool = False


@dataclass
class Message:
    role: str  # "user" | "assistant" | "toolResult"
    content: list[Any] = field(default_factory=list)


class Tool(Protocol):
    name: str
    description: str

    def execute(self, args: dict[str, Any]) -> str: ...


@dataclass
class AgentContext:
    system_prompt: str
    messages: list[Message] = field(default_factory=list)
    tools: list[Tool] = field(default_factory=list)


@dataclass
class LLMResponse:
    content: list[Any]
    stop_reason: str  # "end_turn" | "tool_use" | "error"


# ============================================================================
# LLM Provider (mock — replace with real implementation)
# ============================================================================

def call_llm(context: AgentContext) -> LLMResponse:
    """Call LLM. Replace with OpenAI/Anthropic/local model."""
    print(f"[LLM] Calling with {len(context.messages)} messages, {len(context.tools)} tools")

    last_msg = context.messages[-1] if context.messages else None

    if last_msg and last_msg.role == "toolResult":
        return LLMResponse(
            content=[TextContent(text="Tool executed successfully. Here's the result.")],
            stop_reason="end_turn",
        )

    # Simulate tool call
    tool = context.tools[0] if context.tools else None
    return LLMResponse(
        content=[
            TextContent(text="Let me use a tool."),
            ToolCallContent(
                id=f"call_{uuid.uuid4().hex[:8]}",
                name=tool.name if tool else "unknown",
                arguments={"input": "test"},
            ),
        ],
        stop_reason="tool_use",
    )


# ============================================================================
# Agent Loop (core — heart of the agent)
# ============================================================================

def agent_loop(context: AgentContext) -> list[Message]:
    """
    Core agent loop:
    1. Call LLM
    2. Check for tool calls
    3. Execute tools
    4. Repeat until no more tool calls
    """
    new_messages: list[Message] = []
    has_more_tool_calls = True

    while has_more_tool_calls:
        # 1. Call LLM
        response = call_llm(context)

        # 2. Create assistant message
        assistant_msg = Message(role="assistant", content=response.content)
        context.messages.append(assistant_msg)
        new_messages.append(assistant_msg)

        # 3. Check for tool calls
        tool_calls = [c for c in response.content if isinstance(c, ToolCallContent)]

        if not tool_calls:
            has_more_tool_calls = False
            break

        # 4. Execute tools
        tool_results: list[ToolResultContent] = []

        for tc in tool_calls:
            tool = next((t for t in context.tools if t.name == tc.name), None)

            if not tool:
                tool_results.append(ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=f'Tool "{tc.name}" not found')],
                    is_error=True,
                ))
                continue

            try:
                result = tool.execute(tc.arguments)
                tool_results.append(ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=result)],
                    is_error=False,
                ))
            except Exception as e:
                tool_results.append(ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=f"Error: {e}")],
                    is_error=True,
                ))

        # 5. Add tool results
        tool_result_msg = Message(role="toolResult", content=tool_results)
        context.messages.append(tool_result_msg)
        new_messages.append(tool_result_msg)

    return new_messages


# ============================================================================
# Example
# ============================================================================

class ReadFileTool:
    name = "read_file"
    description = "Read a file"

    def execute(self, args: dict[str, Any]) -> str:
        return f"Contents of {args.get('input', 'unknown')}: [file contents here]"


if __name__ == "__main__":
    ctx = AgentContext(
        system_prompt="You are a helpful coding assistant.",
        messages=[Message(role="user", content=[TextContent(text="Read README.md")])],
        tools=[ReadFileTool()],
    )

    messages = agent_loop(ctx)

    for msg in messages:
        if msg.role == "assistant":
            for part in msg.content:
                if isinstance(part, TextContent):
                    print(f"[Assistant] {part.text}")
                elif isinstance(part, ToolCallContent):
                    print(f"[Tool Call] {part.name}({json.dumps(part.arguments)})")
        elif msg.role == "toolResult":
            for result in msg.content:
                if isinstance(result, ToolResultContent):
                    print(f"[Result] {result.content[0].text}")
