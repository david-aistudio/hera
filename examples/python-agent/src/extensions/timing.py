"""Timing extension — tracks execution performance."""

import time
from typing import Any

from ..agent.types import AgentEvent, EventType


class TimingExtension:
    """Tracks timing for LLM calls and tool executions."""

    def __init__(self):
        self._timers: dict[str, float] = {}
        self._stats: dict[str, list[float]] = {}

    def on_event(self, event: AgentEvent) -> None:
        if event.type == EventType.LLM_CALL:
            self._timers["llm"] = time.time()

        elif event.type == EventType.LLM_RESPONSE:
            start = self._timers.pop("llm", time.time())
            duration = (time.time() - start) * 1000
            self._stats.setdefault("llm", []).append(duration)

        elif event.type == EventType.TOOL_CALL:
            tool = event.data.get("tool", "unknown")
            self._timers[f"tool:{tool}"] = time.time()

        elif event.type == EventType.TOOL_RESULT:
            tool = event.data.get("tool", "unknown")
            key = f"tool:{tool}"
            start = self._timers.pop(key, time.time())
            duration = (time.time() - start) * 1000
            self._stats.setdefault(tool, []).append(duration)

    def get_stats(self) -> dict[str, dict[str, float]]:
        result = {}
        for name, durations in self._stats.items():
            if not durations:
                continue
            result[name] = {
                "count": len(durations),
                "total_ms": round(sum(durations), 1),
                "avg_ms": round(sum(durations) / len(durations), 1),
                "min_ms": round(min(durations), 1),
                "max_ms": round(max(durations), 1),
            }
        return result

    def summary(self) -> str:
        stats = self.get_stats()
        lines = ["=== Timing Stats ==="]
        for name, s in stats.items():
            lines.append(f"  {name}: {s[\'count\']} calls, avg {s[\'avg_ms\']}ms, total {s[\'total_ms\']}ms")
        return "\n".join(lines)
