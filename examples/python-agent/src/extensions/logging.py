"""Structured logging extension."""

import json
import sys
import time
from typing import Any

from ..agent.types import AgentEvent, EventType


class LoggingExtension:
    """Logs all agent activity as structured JSON."""

    def __init__(self, level: str = "info", output=sys.stderr):
        self.level = level
        self.output = output
        self._levels = {"debug": 0, "info": 1, "warning": 2, "error": 3}
        self._min_level = self._levels.get(level, 1)

    def on_event(self, event: AgentEvent) -> None:
        entry = {
            "ts": event.timestamp,
            "event": event.type.value,
            **event.data,
        }

        level = "info"
        if event.type == EventType.ERROR:
            level = "error"
        elif event.type in (EventType.TOOL_CALL, EventType.LLM_CALL):
            level = "debug"

        if self._levels.get(level, 1) >= self._min_level:
            print(json.dumps(entry), file=self.output)
