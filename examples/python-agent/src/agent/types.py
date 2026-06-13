"""
Core types for the agent system.
Based on Pi Agent's type definitions.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol


# ============================================================================
# Content Types
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


# ============================================================================
# Messages
# ============================================================================

@dataclass
class Message:
    role: str  # "user" | "assistant" | "system" | "tool"
    content: list[Any] = field(default_factory=list)
    model: str = ""
    provider: str = ""
    timestamp: float = 0.0

    def __post_init__(self):
        import time
        if not self.timestamp:
            self.timestamp = time.time()


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    duration_ms: float = 0.0


@dataclass
class LLMResponse:
    content: list[Any]
    stop_reason: str  # "end_turn" | "tool_use" | "error"
    usage: Usage = field(default_factory=Usage)
    model: str = ""
    provider: str = ""


# ============================================================================
# Tool Interface
# ============================================================================

@dataclass
class ToolParameter:
    name: str
    type: str
    description: str = ""
    required: bool = False
    default: Any = None
    enum: list[Any] | None = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)

    def to_openai_schema(self) -> dict[str, Any]:
        properties = {}
        required = []
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            properties[p.name] = prop
            if p.required:
                required.append(p.name)
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {"type": "object", "properties": properties, "required": required},
            },
        }

    def to_anthropic_schema(self) -> dict[str, Any]:
        properties = {}
        required = []
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            properties[p.name] = prop
            if p.required:
                required.append(p.name)
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {"type": "object", "properties": properties, "required": required},
        }


class Tool(Protocol):
    def definition(self) -> ToolDefinition: ...
    def execute(self, args: dict[str, Any]) -> str: ...


# ============================================================================
# Provider Interface
# ============================================================================

class Provider(Protocol):
    async def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse: ...
    async def chat_stream(self, messages: list[dict], tools: list[dict] | None = None): ...
    @property
    def name(self) -> str: ...


# ============================================================================
# Agent Events
# ============================================================================

class EventType(Enum):
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    LLM_CALL = "llm_call"
    LLM_RESPONSE = "llm_response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    USER_MESSAGE = "user_message"


@dataclass
class AgentEvent:
    type: EventType
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: float = 0.0

    def __post_init__(self):
        import time
        if not self.timestamp:
            self.timestamp = time.time()
