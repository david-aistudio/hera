"""Session — conversation history with branching and context windows."""

from __future__ import annotations

import time
from typing import Any, Callable

from .storage import EntryType, InMemoryStorage, SessionEntry


class Session:
    """Manages conversation history with branching and context windows."""

    def __init__(self, storage: Any = None, max_context_tokens: int = 128000):
        self.storage = storage or InMemoryStorage()
        self.max_context_tokens = max_context_tokens
        self._current_branch = "main"

    def append_message(self, role: str, content: str, **metadata) -> SessionEntry:
        entry = SessionEntry(
            type=EntryType.MESSAGE,
            data={"role": role, "content": content},
            branch_id=self._current_branch,
            metadata=metadata,
        )
        self.storage.save(entry)
        return entry

    def append_tool_call(self, tool_name: str, arguments: dict) -> SessionEntry:
        entry = SessionEntry(
            type=EntryType.TOOL_CALL,
            data={"tool": tool_name, "arguments": arguments},
            branch_id=self._current_branch,
        )
        self.storage.save(entry)
        return entry

    def append_tool_result(self, tool_call_id: str, result: str, is_error: bool = False) -> SessionEntry:
        entry = SessionEntry(
            type=EntryType.TOOL_RESULT,
            data={"tool_call_id": tool_call_id, "result": result, "is_error": is_error},
            branch_id=self._current_branch,
        )
        self.storage.save(entry)
        return entry

    def get_history(self, limit: int | None = None) -> list[SessionEntry]:
        entries = self.storage.load_branch(self._current_branch)
        if limit:
            entries = entries[-limit:]
        return entries

    def build_context(
        self,
        system_prompt: str,
        token_counter: Callable[[str], int] | None = None,
    ) -> list[dict[str, Any]]:
        """Build LLM context from session history."""
        if token_counter is None:
            token_counter = lambda text: len(text) // 4

        entries = self.get_history()
        available = self.max_context_tokens - token_counter(system_prompt)

        messages = [{"role": "system", "content": system_prompt}]

        for entry in entries:
            if entry.type == EntryType.MESSAGE:
                content = entry.data.get("content", "")
                tokens = token_counter(content)

                if tokens > available:
                    messages.insert(1, {
                        "role": "system",
                        "content": f"[{len(entries) - len(messages) + 1} messages truncated]",
                    })
                    break

                available -= tokens
                messages.append({"role": entry.data["role"], "content": content})

        return messages

    def create_branch(self, name: str | None = None) -> str:
        branch_id = name or f"branch-{int(time.time())}"
        return branch_id

    def switch_branch(self, branch_id: str) -> None:
        self._current_branch = branch_id

    def get_checkpoint(self) -> dict[str, Any]:
        return {"branch": self._current_branch, "timestamp": time.time()}

    @classmethod
    def from_checkpoint(cls, checkpoint: dict[str, Any], storage: Any = None) -> "Session":
        session = cls(storage=storage)
        session._current_branch = checkpoint.get("branch", "main")
        return session
