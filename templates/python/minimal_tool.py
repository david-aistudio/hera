"""
Minimal Tool — Hera Architecture Reference (Python)

Tool definition, validation, execution, and registry pattern.
Every tool follows the same interface — consistent, composable, testable.

Based on Pi Agent's tool system (packages/agent/src/tools/).
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable


# ============================================================================
# Types
# ============================================================================

@dataclass
class ToolParameter:
    """JSON Schema-style parameter definition."""
    name: str
    type: str  # "string", "number", "boolean", "array", "object"
    description: str = ""
    required: bool = False
    default: Any = None
    enum: list[Any] | None = None


@dataclass
class ToolResult:
    """Standardized tool result."""
    output: str
    is_error: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolDefinition:
    """Tool definition for LLM function calling."""
    name: str
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)

    def to_openai_schema(self) -> dict[str, Any]:
        """Convert to OpenAI function calling format."""
        properties = {}
        required = []

        for param in self.parameters:
            properties[param.name] = {
                "type": param.type,
                "description": param.description,
            }
            if param.enum:
                properties[param.name]["enum"] = param.enum
            if param.required:
                required.append(param.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }

    def to_anthropic_schema(self) -> dict[str, Any]:
        """Convert to Anthropic tool format."""
        properties = {}
        required = []

        for param in self.parameters:
            properties[param.name] = {
                "type": param.type,
                "description": param.description,
            }
            if param.enum:
                properties[param.name]["enum"] = param.enum
            if param.required:
                required.append(param.name)

        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        }


# ============================================================================
# Tool Interface
# ============================================================================

class BaseTool(ABC):
    """Base class for all tools."""

    @abstractmethod
    def definition(self) -> ToolDefinition:
        """Return tool definition for LLM."""
        ...

    @abstractmethod
    def execute(self, args: dict[str, Any]) -> ToolResult:
        """Execute the tool."""
        ...

    def validate(self, args: dict[str, Any]) -> str | None:
        """Validate arguments. Return error message or None."""
        defn = self.definition()
        for param in defn.parameters:
            if param.required and param.name not in args:
                return f"Missing required parameter: {param.name}"
            if param.name in args and param.enum:
                if args[param.name] not in param.enum:
                    return f"Invalid value for {param.name}: {args[param.name]}. Must be one of {param.enum}"
        return None

    def safe_execute(self, args: dict[str, Any]) -> ToolResult:
        """Execute with validation and error handling."""
        # Validate
        error = self.validate(args)
        if error:
            return ToolResult(output=error, is_error=True)

        # Execute
        try:
            return self.execute(args)
        except Exception as e:
            return ToolResult(output=f"Tool error: {e}", is_error=True)


# ============================================================================
# Example Tools
# ============================================================================

class ReadFileTool(BaseTool):
    """Read a file from the filesystem."""

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="read_file",
            description="Read the contents of a file",
            parameters=[
                ToolParameter(
                    name="path",
                    type="string",
                    description="Absolute path to the file",
                    required=True,
                ),
                ToolParameter(
                    name="encoding",
                    type="string",
                    description="File encoding",
                    default="utf-8",
                ),
            ],
        )

    def execute(self, args: dict[str, Any]) -> ToolResult:
        path = args["path"]
        encoding = args.get("encoding", "utf-8")

        if not os.path.exists(path):
            return ToolResult(output=f"File not found: {path}", is_error=True)

        try:
            with open(path, encoding=encoding) as f:
                content = f.read()
            return ToolResult(output=content)
        except Exception as e:
            return ToolResult(output=f"Failed to read {path}: {e}", is_error=True)


class WriteFileTool(BaseTool):
    """Write content to a file."""

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="write_file",
            description="Write content to a file (creates or overwrites)",
            parameters=[
                ToolParameter(name="path", type="string", description="File path", required=True),
                ToolParameter(name="content", type="string", description="Content to write", required=True),
            ],
        )

    def execute(self, args: dict[str, Any]) -> ToolResult:
        path = args["path"]
        content = args["content"]

        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(content)
            return ToolResult(output=f"Wrote {len(content)} bytes to {path}")
        except Exception as e:
            return ToolResult(output=f"Failed to write {path}: {e}", is_error=True)


# ============================================================================
# Tool Registry
# ============================================================================

class ToolRegistry:
    """Central registry for all tools."""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        """Register a tool."""
        name = tool.definition().name
        if name in self._tools:
            raise ValueError(f"Tool '{name}' already registered")
        self._tools[name] = tool

    def get(self, name: str) -> BaseTool | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def execute(self, name: str, args: dict[str, Any]) -> ToolResult:
        """Execute a tool by name."""
        tool = self.get(name)
        if not tool:
            return ToolResult(output=f"Tool '{name}' not found", is_error=True)
        return tool.safe_execute(args)

    def list_tools(self) -> list[str]:
        """List all registered tool names."""
        return list(self._tools.keys())

    def to_openai_schema(self) -> list[dict[str, Any]]:
        """Export all tools in OpenAI format."""
        return [t.definition().to_openai_schema() for t in self._tools.values()]

    def to_anthropic_schema(self) -> list[dict[str, Any]]:
        """Export all tools in Anthropic format."""
        return [t.definition().to_anthropic_schema() for t in self._tools.values()]


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    registry = ToolRegistry()
    registry.register(ReadFileTool())
    registry.register(WriteFileTool())

    # Export for LLM
    print("=== OpenAI Schema ===")
    print(json.dumps(registry.to_openai_schema(), indent=2))

    print("\n=== Anthropic Schema ===")
    print(json.dumps(registry.to_anthropic_schema(), indent=2))

    # Execute
    result = registry.execute("read_file", {"path": "/etc/hostname"})
    print(f"\nRead result: {result.output} (error={result.is_error})")

    # Validation
    result = registry.execute("read_file", {})
    print(f"Validation: {result.output} (error={result.is_error})")
