"""
Agent Loop — the heart of the agent.

Call LLM → check for tool calls → execute tools → repeat.
Based on Pi Agent's agent-loop.ts.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable

from .types import (
    AgentEvent,
    EventType,
    LLMResponse,
    Message,
    TextContent,
    ToolCallContent,
    ToolResultContent,
    Usage,
)


class AgentLoop:
    """
    Core agent loop with event emission.

    The loop:
    1. Calls the LLM with current context
    2. If LLM returns tool calls, executes them
    3. Adds tool results to context
    4. Repeats until LLM returns text (no tool calls)
    """

    def __init__(
        self,
        provider: Any,
        tools: dict[str, Any],
        system_prompt: str,
        on_event: Callable[[AgentEvent], None] | None = None,
        max_iterations: int = 50,
    ):
        self.provider = provider
        self.tools = tools
        self.system_prompt = system_prompt
        self.on_event = on_event or (lambda e: None)
        self.max_iterations = max_iterations

    async def run(self, messages: list[Message]) -> list[Message]:
        """Run the agent loop and return new messages."""
        new_messages: list[Message] = []
        iteration = 0

        self.on_event(AgentEvent(type=EventType.AGENT_START))

        while iteration < self.max_iterations:
            iteration += 1

            # 1. Build LLM messages
            llm_messages = self._build_llm_messages(messages + new_messages)

            # 2. Call LLM
            self.on_event(AgentEvent(
                type=EventType.LLM_CALL,
                data={"iteration": iteration, "message_count": len(llm_messages)},
            ))

            start = time.time()
            response = await self.provider.chat(
                messages=llm_messages,
                tools=self._get_tool_schemas(),
            )
            duration_ms = (time.time() - start) * 1000

            self.on_event(AgentEvent(
                type=EventType.LLM_RESPONSE,
                data={
                    "iteration": iteration,
                    "stop_reason": response.stop_reason,
                    "tokens": response.usage.total_tokens,
                    "duration_ms": duration_ms,
                },
            ))

            # 3. Create assistant message
            assistant_msg = Message(
                role="assistant",
                content=response.content,
                model=response.model,
                provider=response.provider,
            )
            new_messages.append(assistant_msg)

            # 4. Check for tool calls
            tool_calls = [c for c in response.content if isinstance(c, ToolCallContent)]

            if not tool_calls:
                # No tool calls — agent is done
                break

            # 5. Execute tools (parallel when possible)
            tool_results = await self._execute_tools(tool_calls)

            # 6. Add tool results
            tool_msg = Message(role="tool", content=tool_results)
            new_messages.append(tool_msg)

        self.on_event(AgentEvent(type=EventType.AGENT_END, data={"iterations": iteration}))

        return new_messages

    def _build_llm_messages(self, messages: list[Message]) -> list[dict[str, Any]]:
        """Convert internal messages to LLM format."""
        result = []

        # System prompt
        if self.system_prompt:
            result.append({"role": "system", "content": self.system_prompt})

        for msg in messages:
            if msg.role == "assistant":
                # Extract text and tool calls
                text_parts = []
                tool_calls = []
                for part in msg.content:
                    if isinstance(part, TextContent):
                        text_parts.append(part.text)
                    elif isinstance(part, ToolCallContent):
                        tool_calls.append({
                            "id": part.id,
                            "type": "function",
                            "function": {
                                "name": part.name,
                                "arguments": str(part.arguments).replace("'", '"'),
                            },
                        })

                entry: dict[str, Any] = {"role": "assistant"}
                if text_parts:
                    entry["content"] = "\n".join(text_parts)
                if tool_calls:
                    entry["tool_calls"] = tool_calls
                result.append(entry)

            elif msg.role == "tool":
                for part in msg.content:
                    if isinstance(part, ToolResultContent):
                        result.append({
                            "role": "tool",
                            "tool_call_id": part.tool_call_id,
                            "content": part.content[0].text if part.content else "",
                        })

            elif msg.role in ("user", "system"):
                text = ""
                for part in msg.content:
                    if isinstance(part, TextContent):
                        text += part.text
                result.append({"role": msg.role, "content": text})

        return result

    def _get_tool_schemas(self) -> list[dict[str, Any]]:
        """Get tool schemas in provider format."""
        schemas = []
        for tool in self.tools.values():
            try:
                schema = tool.definition().to_openai_schema()
                schemas.append(schema)
            except Exception:
                pass
        return schemas

    async def _execute_tools(self, tool_calls: list[ToolCallContent]) -> list[ToolResultContent]:
        """Execute tool calls (parallel when possible)."""
        results: list[ToolResultContent] = []

        # Group by tool name
        tasks = []
        for tc in tool_calls:
            tool = self.tools.get(tc.name)
            if not tool:
                results.append(ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=f"Tool \"{tc.name}\" not found")],
                    is_error=True,
                ))
                continue

            tasks.append((tc, tool))

        # Execute in parallel
        async def run_tool(tc: ToolCallContent, tool: Any) -> ToolResultContent:
            self.on_event(AgentEvent(
                type=EventType.TOOL_CALL,
                data={"tool": tc.name, "args": tc.arguments, "id": tc.id},
            ))

            start = time.time()
            try:
                result = await asyncio.to_thread(tool.execute, tc.arguments)
                duration_ms = (time.time() - start) * 1000

                self.on_event(AgentEvent(
                    type=EventType.TOOL_RESULT,
                    data={"tool": tc.name, "duration_ms": duration_ms, "success": True},
                ))

                return ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=result)],
                    is_error=False,
                )
            except Exception as e:
                duration_ms = (time.time() - start) * 1000

                self.on_event(AgentEvent(
                    type=EventType.TOOL_RESULT,
                    data={"tool": tc.name, "duration_ms": duration_ms, "success": False, "error": str(e)},
                ))

                return ToolResultContent(
                    tool_call_id=tc.id,
                    content=[TextContent(text=f"Error: {e}")],
                    is_error=True,
                )

        if tasks:
            parallel_results = await asyncio.gather(
                *[run_tool(tc, tool) for tc, tool in tasks],
                return_exceptions=True,
            )
            for r in parallel_results:
                if isinstance(r, ToolResultContent):
                    results.append(r)
                elif isinstance(r, Exception):
                    results.append(ToolResultContent(
                        tool_call_id="unknown",
                        content=[TextContent(text=f"Execution error: {r}")],
                        is_error=True,
                    ))

        return results
