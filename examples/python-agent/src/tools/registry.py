"""Tool registry with validation and multi-format export."""

from __future__ import annotations

import json
from typing import Any


class ToolRegistry:
    """Central registry for all tools."""

    def __init__(self):
        self._tools: dict[str, Any] = {}

    def register(self, tool: Any) -> None:
        name = tool.name if hasattr(tool, "name") else tool.definition().name
        self._tools[name] = tool

    def get(self, name: str) -> Any | None:
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())

    def as_dict(self) -> dict[str, Any]:
        return dict(self._tools)

    def to_openai_schema(self) -> list[dict]:
        schemas = []
        for tool in self._tools.values():
            try:
                schemas.append(tool.definition().to_openai_schema())
            except Exception:
                pass
        return schemas

    def to_anthropic_schema(self) -> list[dict]:
        schemas = []
        for tool in self._tools.values():
            try:
                schemas.append(tool.definition().to_anthropic_schema())
            except Exception:
                pass
        return schemas
