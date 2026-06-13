"""
Minimal Extension — Hera Architecture Reference (Python)

Plugin/extension system for adding capabilities to agents.
Extensions hook into the agent lifecycle: before/after tool calls,
before/after LLM calls, on errors, on startup/shutdown.

Based on Pi Agent's extension system (packages/agent/src/extensions/).
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ============================================================================
# Types
# ============================================================================

class HookPoint(Enum):
    """When an extension hook fires."""
    BEFORE_LLM = "before_llm"
    AFTER_LLM = "after_llm"
    BEFORE_TOOL = "before_tool"
    AFTER_TOOL = "after_tool"
    ON_ERROR = "on_error"
    ON_START = "on_start"
    ON_STOP = "on_stop"
    ON_MESSAGE = "on_message"


@dataclass
class HookContext:
    """Context passed to extension hooks."""
    hook_point: HookPoint
    data: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HookResult:
    """Result from an extension hook."""
    continue_processing: bool = True
    modified_data: dict[str, Any] | None = None
    error: str | None = None


# ============================================================================
# Extension Interface
# ============================================================================

class Extension(ABC):
    """Base class for all extensions."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Extension name (must be unique)."""
        ...

    @property
    def priority(self) -> int:
        """Lower = runs first. Default 100."""
        return 100

    def hooks(self) -> list[HookPoint]:
        """Which hooks this extension handles. Override to limit."""
        return list(HookPoint)

    def on_start(self, context: HookContext) -> HookResult:
        """Called when agent starts."""
        return HookResult()

    def on_stop(self, context: HookContext) -> HookResult:
        """Called when agent stops."""
        return HookResult()

    def before_llm(self, context: HookContext) -> HookResult:
        """Called before LLM invocation. Can modify messages."""
        return HookResult()

    def after_llm(self, context: HookContext) -> HookResult:
        """Called after LLM response. Can modify response."""
        return HookResult()

    def before_tool(self, context: HookContext) -> HookResult:
        """Called before tool execution. Can block or modify args."""
        return HookResult()

    def after_tool(self, context: HookContext) -> HookResult:
        """Called after tool execution. Can modify result."""
        return HookResult()

    def on_error(self, context: HookContext) -> HookResult:
        """Called on error. Can suppress or transform."""
        return HookResult()

    def on_message(self, context: HookContext) -> HookResult:
        """Called on new message. Can inject messages."""
        return HookResult()


# ============================================================================
# Extension Manager
# ============================================================================

class ExtensionManager:
    """Manages and executes extensions."""

    def __init__(self):
        self._extensions: list[Extension] = []
        self._by_name: dict[str, Extension] = {}

    def register(self, ext: Extension) -> None:
        """Register an extension."""
        if ext.name in self._by_name:
            raise ValueError(f"Extension '{ext.name}' already registered")
        self._extensions.append(ext)
        self._by_name[ext.name] = ext
        # Sort by priority
        self._extensions.sort(key=lambda e: e.priority)

    def unregister(self, name: str) -> None:
        """Remove an extension."""
        ext = self._by_name.pop(name, None)
        if ext:
            self._extensions.remove(ext)

    def get(self, name: str) -> Extension | None:
        """Get extension by name."""
        return self._by_name.get(name)

    def execute_hook(self, hook_point: HookPoint, data: dict[str, Any] | None = None) -> HookResult:
        """Execute all extensions for a hook point."""
        context = HookContext(hook_point=hook_point, data=data or {})
        final_result = HookResult()

        for ext in self._extensions:
            if hook_point not in ext.hooks():
                continue

            # Get the hook method
            method = getattr(ext, hook_point.value, None)
            if not method:
                continue

            try:
                result = method(context)
                if result and not result.continue_processing:
                    # Extension wants to stop processing
                    final_result = result
                    break
                if result and result.modified_data:
                    # Merge modifications
                    context.data.update(result.modified_data)
                    final_result.modified_data = context.data
            except Exception as e:
                print(f"[Extension {ext.name}] Error in {hook_point.value}: {e}")

        return final_result

    def list_extensions(self) -> list[dict[str, Any]]:
        """List all registered extensions."""
        return [
            {"name": ext.name, "priority": ext.priority, "hooks": [h.value for h in ext.hooks()]}
            for ext in self._extensions
        ]


# ============================================================================
# Example Extensions
# ============================================================================

class LoggingExtension(Extension):
    """Logs all agent activity."""

    @property
    def name(self) -> str:
        return "logging"

    @property
    def priority(self) -> int:
        return 10  # Run early

    def before_llm(self, context: HookContext) -> HookResult:
        messages = context.data.get("messages", [])
        print(f"[LOG] Calling LLM with {len(messages)} messages")
        return HookResult()

    def after_llm(self, context: HookContext) -> HookResult:
        response = context.data.get("response", {})
        tokens = response.get("usage", {}).get("total_tokens", 0)
        print(f"[LOG] LLM responded — {tokens} tokens")
        return HookResult()

    def before_tool(self, context: HookContext) -> HookResult:
        tool_name = context.data.get("tool_name", "unknown")
        print(f"[LOG] Executing tool: {tool_name}")
        return HookResult()

    def after_tool(self, context: HookContext) -> HookResult:
        tool_name = context.data.get("tool_name", "unknown")
        duration = context.data.get("duration_ms", 0)
        print(f"[LOG] Tool {tool_name} completed in {duration:.1f}ms")
        return HookResult()

    def on_error(self, context: HookContext) -> HookResult:
        error = context.data.get("error", "unknown")
        print(f"[LOG] Error: {error}")
        return HookResult()


class SecurityExtension(Extension):
    """Blocks dangerous tool calls."""

    BLOCKED_PATTERNS = [
        "rm -rf",
        "mkfs",
        "dd if=",
        "curl | sh",
        "wget | bash",
    ]

    @property
    def name(self) -> str:
        return "security"

    @property
    def priority(self) -> int:
        return 5  # Run before everything

    def hooks(self) -> list[HookPoint]:
        return [HookPoint.BEFORE_TOOL]

    def before_tool(self, context: HookContext) -> HookResult:
        tool_name = context.data.get("tool_name", "")
        args = context.data.get("args", {})

        if tool_name == "bash":
            command = args.get("command", "")
            for pattern in self.BLOCKED_PATTERNS:
                if pattern in command:
                    return HookResult(
                        continue_processing=False,
                        error=f"Blocked dangerous command: {pattern}",
                    )

        return HookResult()


class TimingExtension(Extension):
    """Tracks execution time for all operations."""

    def __init__(self):
        self._timers: dict[str, float] = {}
        self._stats: dict[str, list[float]] = {}

    @property
    def name(self) -> str:
        return "timing"

    @property
    def priority(self) -> int:
        return 20

    def before_llm(self, context: HookContext) -> HookResult:
        self._timers["llm"] = time.time()
        return HookResult()

    def after_llm(self, context: HookContext) -> HookResult:
        duration = (time.time() - self._timers.get("llm", time.time())) * 1000
        self._stats.setdefault("llm", []).append(duration)
        context.data["duration_ms"] = duration
        return HookResult(modified_data=context.data)

    def before_tool(self, context: HookContext) -> HookResult:
        tool_name = context.data.get("tool_name", "unknown")
        self._timers[f"tool:{tool_name}"] = time.time()
        return HookResult()

    def after_tool(self, context: HookContext) -> HookResult:
        tool_name = context.data.get("tool_name", "unknown")
        key = f"tool:{tool_name}"
        duration = (time.time() - self._timers.get(key, time.time())) * 1000
        self._stats.setdefault(tool_name, []).append(duration)
        context.data["duration_ms"] = duration
        return HookResult(modified_data=context.data)

    def get_stats(self) -> dict[str, dict[str, float]]:
        """Get timing statistics."""
        result = {}
        for name, durations in self._stats.items():
            result[name] = {
                "count": len(durations),
                "total_ms": sum(durations),
                "avg_ms": sum(durations) / len(durations),
                "min_ms": min(durations),
                "max_ms": max(durations),
            }
        return result


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    manager = ExtensionManager()

    # Register extensions
    manager.register(LoggingExtension())
    manager.register(SecurityExtension())
    manager.register(TimingExtension())

    # List
    print("=== Extensions ===")
    for ext in manager.list_extensions():
        print(f"  {ext['name']} (priority={ext['priority']})")

    # Simulate lifecycle
    print("\n=== Lifecycle ===")
    manager.execute_hook(HookPoint.ON_START)
    manager.execute_hook(HookPoint.BEFORE_LLM, {"messages": [{"role": "user", "content": "test"}]})
    manager.execute_hook(HookPoint.AFTER_LLM, {"response": {"usage": {"total_tokens": 100}}})
    manager.execute_hook(HookPoint.BEFORE_TOOL, {"tool_name": "bash", "args": {"command": "ls -la"}})
    manager.execute_hook(HookPoint.BEFORE_TOOL, {"tool_name": "bash", "args": {"command": "rm -rf /"}})
    manager.execute_hook(HookPoint.ON_STOP)

    # Stats
    timing = manager.get("timing")
    if timing and isinstance(timing, TimingExtension):
        print(f"\n=== Timing Stats ===")
        for name, stats in timing.get_stats().items():
            print(f"  {name}: {stats['count']} calls, avg {stats['avg_ms']:.1f}ms")
