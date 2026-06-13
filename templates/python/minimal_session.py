"""
Minimal Session — Hera Architecture Reference (Python)

Session management: conversation history, branching, persistence.
Handles context windows, message storage, and state recovery.

Based on Pi Agent's session system (packages/agent/src/session/).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol


# ============================================================================
# Types
# ============================================================================

class EntryType(Enum):
    MESSAGE = "message"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    SUMMARY = "summary"
    CHECKPOINT = "checkpoint"


@dataclass
class SessionEntry:
    """Single entry in the conversation history."""
    id: str
    type: EntryType
    data: dict[str, Any]
    parent_id: str | None = None
    branch_id: str = "main"
    timestamp: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.id:
            self.id = uuid.uuid4().hex[:12]
        if not self.timestamp:
            self.timestamp = time.time()


@dataclass
class ContextWindow:
    """Token budget for a single LLM call."""
    max_tokens: int
    used_tokens: int = 0

    @property
    def remaining(self) -> int:
        return self.max_tokens - self.used_tokens

    def can_fit(self, token_count: int) -> bool:
        return (self.used_tokens + token_count) <= self.max_tokens

    def allocate(self, token_count: int) -> bool:
        if self.can_fit(token_count):
            self.used_tokens += token_count
            return True
        return False


# ============================================================================
# Storage Interface
# ============================================================================

class SessionStorage(Protocol):
    """Protocol for session persistence."""

    def save(self, entry: SessionEntry) -> None: ...
    def load(self, entry_id: str) -> SessionEntry | None: ...
    def load_branch(self, branch_id: str) -> list[SessionEntry]: ...
    def delete(self, entry_id: str) -> None: ...


# ============================================================================
# In-Memory Storage
# ============================================================================

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


# ============================================================================
# JSON File Storage
# ============================================================================

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
            "parent_id": entry.parent_id,
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
            parent_id=data.get("parent_id"),
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


# ============================================================================
# Session
# ============================================================================

class Session:
    """Manages conversation history with branching and context windows."""

    def __init__(self, storage: SessionStorage, max_context_tokens: int = 128000):
        self.storage = storage
        self.max_context_tokens = max_context_tokens
        self._current_branch = "main"
        self._entry_ids: list[str] = []

    def append_message(self, role: str, content: str, **metadata) -> SessionEntry:
        """Append a message to the current branch."""
        entry = SessionEntry(
            id="",
            type=EntryType.MESSAGE,
            data={"role": role, "content": content},
            branch_id=self._current_branch,
            metadata=metadata,
        )
        self.storage.save(entry)
        self._entry_ids.append(entry.id)
        return entry

    def append_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> SessionEntry:
        """Record a tool call."""
        entry = SessionEntry(
            id="",
            type=EntryType.TOOL_CALL,
            data={"tool": tool_name, "arguments": arguments},
            branch_id=self._current_branch,
        )
        self.storage.save(entry)
        self._entry_ids.append(entry.id)
        return entry

    def append_tool_result(self, tool_call_id: str, result: str, is_error: bool = False) -> SessionEntry:
        """Record a tool result."""
        entry = SessionEntry(
            id="",
            type=EntryType.TOOL_RESULT,
            data={"tool_call_id": tool_call_id, "result": result, "is_error": is_error},
            branch_id=self._current_branch,
        )
        self.storage.save(entry)
        self._entry_ids.append(entry.id)
        return entry

    def get_history(self, limit: int | None = None) -> list[SessionEntry]:
        """Get conversation history for current branch."""
        entries = self.storage.load_branch(self._current_branch)
        if limit:
            entries = entries[-limit:]
        return entries

    def build_context(self, system_prompt: str, token_counter: Callable[[str], int] | None = None) -> list[dict[str, Any]]:
        """
        Build LLM context from session history.
        Handles context window limits by summarizing old messages.
        """
        entries = self.get_history()

        # Default token counter (rough estimate: 4 chars per token)
        if token_counter is None:
            token_counter = lambda text: len(text) // 4

        window = ContextWindow(max_tokens=self.max_context_tokens)

        # System prompt
        system_tokens = token_counter(system_prompt)
        window.allocate(system_tokens)

        messages = [{"role": "system", "content": system_prompt}]

        # Add messages (newest first, stop when budget exceeded)
        for entry in entries:
            if entry.type == EntryType.MESSAGE:
                msg = entry.data
                text = msg.get("content", "")
                tokens = token_counter(text)

                if not window.can_fit(tokens):
                    # Context full — add summary placeholder
                    messages.append({
                        "role": "system",
                        "content": f"[{len(entries) - len(messages) + 1} messages truncated due to context limit]",
                    })
                    break

                window.allocate(tokens)
                messages.append(msg)

        return messages

    def create_branch(self, from_entry_id: str, name: str | None = None) -> str:
        """Create a new branch from a specific entry."""
        branch_id = name or f"branch-{uuid.uuid4().hex[:6]}"
        # Future: copy entries to new branch
        return branch_id

    def switch_branch(self, branch_id: str) -> None:
        """Switch to a different branch."""
        self._current_branch = branch_id

    def get_checkpoint(self) -> dict[str, Any]:
        """Get current session state for persistence."""
        return {
            "branch": self._current_branch,
            "entry_ids": self._entry_ids,
            "timestamp": time.time(),
        }

    @classmethod
    def from_checkpoint(cls, checkpoint: dict[str, Any], storage: SessionStorage) -> Session:
        """Restore session from checkpoint."""
        session = cls(storage=storage)
        session._current_branch = checkpoint.get("branch", "main")
        session._entry_ids = checkpoint.get("entry_ids", [])
        return session


# ============================================================================
# Example
# ============================================================================

def main():
    storage = InMemoryStorage()
    session = Session(storage=storage, max_context_tokens=8000)

    # Build conversation
    session.append_message("user", "Read the file README.md")
    session.append_message("assistant", "I'll read that file for you.")
    session.append_tool_call("read_file", {"path": "README.md"})
    session.append_tool_result("call_1", "# My Project\n\nThis is a test project.")
    session.append_message("assistant", "The README describes a test project.")

    # Build context for next LLM call
    context = session.build_context("You are a helpful coding assistant.")
    print("=== Context ===")
    for msg in context:
        print(f"[{msg['role']}] {msg['content'][:80]}...")

    # Checkpoint
    checkpoint = session.get_checkpoint()
    print(f"\n=== Checkpoint ===")
    print(json.dumps(checkpoint, indent=2))

    # Restore
    restored = Session.from_checkpoint(checkpoint, storage)
    history = restored.get_history()
    print(f"\n=== Restored ({len(history)} entries) ===")
    for entry in history:
        print(f"[{entry.type.value}] {json.dumps(entry.data)[:80]}...")


if __name__ == "__main__":
    main()
