"""Session storage backends."""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class EntryType(Enum):
    MESSAGE = "message"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    SUMMARY = "summary"


@dataclass
class SessionEntry:
    id: str = ""
    type: EntryType = EntryType.MESSAGE
    data: dict[str, Any] = field(default_factory=dict)
    branch_id: str = "main"
    timestamp: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.id:
            self.id = uuid.uuid4().hex[:12]
        if not self.timestamp:
            self.timestamp = time.time()


class InMemoryStorage:
    """Simple in-memory session storage."""

    def __init__(self):
        self._entries: dict[str, SessionEntry] = {}

    def save(self, entry: SessionEntry) -> None:
        self._entries[entry.id] = entry

    def load(self, entry_id: str) -> SessionEntry | None:
        return self._entries.get(entry_id)

    def load_branch(self, branch_id: str) -> list[SessionEntry]:
        return sorted(
            [e for e in self._entries.values() if e.branch_id == branch_id],
            key=lambda e: e.timestamp,
        )

    def delete(self, entry_id: str) -> None:
        self._entries.pop(entry_id, None)

    def clear(self) -> None:
        self._entries.clear()


class JsonFileStorage:
    """Persist sessions to JSON files."""

    def __init__(self, directory: str):
        self._dir = directory
        os.makedirs(directory, exist_ok=True)

    def _path(self, entry_id: str) -> str:
        return os.path.join(self._dir, f"{entry_id}.json")

    def save(self, entry: SessionEntry) -> None:
        data = {
            "id": entry.id,
            "type": entry.type.value,
            "data": entry.data,
            "branch_id": entry.branch_id,
            "timestamp": entry.timestamp,
            "metadata": entry.metadata,
        }
        with open(self._path(entry.id), "w") as f:
            json.dump(data, f, indent=2)

    def load(self, entry_id: str) -> SessionEntry | None:
        path = self._path(entry_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            data = json.load(f)
        return SessionEntry(
            id=data["id"],
            type=EntryType(data["type"]),
            data=data["data"],
            branch_id=data.get("branch_id", "main"),
            timestamp=data.get("timestamp", 0),
            metadata=data.get("metadata", {}),
        )

    def load_branch(self, branch_id: str) -> list[SessionEntry]:
        entries = []
        for fname in os.listdir(self._dir):
            if fname.endswith(".json"):
                entry = self.load(fname.replace(".json", ""))
                if entry and entry.branch_id == branch_id:
                    entries.append(entry)
        return sorted(entries, key=lambda e: e.timestamp)

    def delete(self, entry_id: str) -> None:
        path = self._path(entry_id)
        if os.path.exists(path):
            os.remove(path)
