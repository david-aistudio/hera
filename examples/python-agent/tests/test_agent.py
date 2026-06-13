"""Tests for the Hera Python Example Agent."""

import asyncio
import json
import os
import tempfile

import pytest

from src.agent.types import (
    LLMResponse,
    Message,
    TextContent,
    ToolCallContent,
    ToolResultContent,
    Usage,
)
from src.tools.bash import BashTool
from src.tools.read_file import ReadFileTool
from src.tools.registry import ToolRegistry
from src.tools.write_file import WriteFileTool
from src.session.session import Session
from src.session.storage import InMemoryStorage, EntryType
from src.extensions.logging import LoggingExtension
from src.extensions.security import SecurityExtension
from src.extensions.timing import TimingExtension


# ============================================================================
# Tool Tests
# ============================================================================

class TestReadFileTool:
    def test_definition(self):
        tool = ReadFileTool()
        defn = tool.definition()
        assert defn.name == "read_file"
        assert len(defn.parameters) == 2
        assert defn.parameters[0].required is True

    def test_read_existing_file(self):
        tool = ReadFileTool()
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("hello world")
            path = f.name

        try:
            result = tool.execute({"path": path})
            assert "hello world" in result
            assert "1|" in result  # Line numbers
        finally:
            os.unlink(path)

    def test_read_nonexistent_file(self):
        tool = ReadFileTool()
        result = tool.execute({"path": "/nonexistent/file.txt"})
        assert "Error" in result

    def test_read_directory(self):
        tool = ReadFileTool()
        result = tool.execute({"path": "/tmp"})
        assert "directory" in result.lower()

    def test_openai_schema(self):
        tool = ReadFileTool()
        schema = tool.definition().to_openai_schema()
        assert schema["type"] == "function"
        assert schema["function"]["name"] == "read_file"

    def test_anthropic_schema(self):
        tool = ReadFileTool()
        schema = tool.definition().to_anthropic_schema()
        assert schema["name"] == "read_file"
        assert "input_schema" in schema


class TestWriteFileTool:
    def test_write_file(self):
        tool = WriteFileTool()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.txt")
            result = tool.execute({"path": path, "content": "hello"})
            assert "Wrote" in result
            assert os.path.exists(path)
            with open(path) as f:
                assert f.read() == "hello"

    def test_write_creates_dirs(self):
        tool = WriteFileTool()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "sub", "dir", "test.txt")
            result = tool.execute({"path": path, "content": "hello"})
            assert "Wrote" in result
            assert os.path.exists(path)


class TestBashTool:
    def test_basic_command(self):
        tool = BashTool()
        result = tool.execute({"command": "echo hello"})
        assert "hello" in result

    def test_blocked_command(self):
        tool = BashTool()
        result = tool.execute({"command": "rm -rf /"})
        assert "Error" in result
        assert "blocked" in result.lower()

    def test_timeout(self):
        tool = BashTool(timeout=1)
        result = tool.execute({"command": "sleep 10", "timeout": 1})
        assert "timed out" in result.lower()

    def test_exit_code(self):
        tool = BashTool()
        result = tool.execute({"command": "exit 1"})
        assert "exit code: 1" in result


# ============================================================================
# Registry Tests
# ============================================================================

class TestToolRegistry:
    def test_register_and_get(self):
        registry = ToolRegistry()
        tool = ReadFileTool()
        registry.register(tool)
        assert registry.get("read_file") is tool

    def test_list_tools(self):
        registry = ToolRegistry()
        registry.register(ReadFileTool())
        registry.register(WriteFileTool())
        registry.register(BashTool())
        assert len(registry.list_tools()) == 3

    def test_openai_schema(self):
        registry = ToolRegistry()
        registry.register(ReadFileTool())
        registry.register(WriteFileTool())
        schemas = registry.to_openai_schema()
        assert len(schemas) == 2
        assert all(s["type"] == "function" for s in schemas)

    def test_anthropic_schema(self):
        registry = ToolRegistry()
        registry.register(ReadFileTool())
        schemas = registry.to_anthropic_schema()
        assert len(schemas) == 1
        assert "input_schema" in schemas[0]


# ============================================================================
# Session Tests
# ============================================================================

class TestSession:
    def test_append_and_get(self):
        storage = InMemoryStorage()
        session = Session(storage=storage)

        session.append_message("user", "hello")
        session.append_message("assistant", "hi there")

        history = session.get_history()
        assert len(history) == 2
        assert history[0].data["role"] == "user"
        assert history[1].data["content"] == "hi there"

    def test_build_context(self):
        storage = InMemoryStorage()
        session = Session(storage=storage)

        session.append_message("user", "hello")
        session.append_message("assistant", "hi")

        context = session.build_context("You are helpful.")
        assert context[0]["role"] == "system"
        assert context[0]["content"] == "You are helpful."
        assert len(context) == 3

    def test_context_truncation(self):
        storage = InMemoryStorage()
        session = Session(storage=storage, max_context_tokens=100)

        for i in range(100):
            session.append_message("user", f"message {i} " * 10)

        context = session.build_context("System prompt")
        assert len(context) < 100  # Should be truncated

    def test_checkpoint_restore(self):
        storage = InMemoryStorage()
        session = Session(storage=storage)
        session.append_message("user", "test")

        checkpoint = session.get_checkpoint()
        restored = Session.from_checkpoint(checkpoint, storage)
        assert restored._current_branch == session._current_branch

    def test_branching(self):
        storage = InMemoryStorage()
        session = Session(storage=storage)
        branch = session.create_branch("test-branch")
        assert branch == "test-branch"


# ============================================================================
# Extension Tests
# ============================================================================

class TestSecurityExtension:
    def test_blocks_dangerous_command(self):
        ext = SecurityExtension()
        from src.agent.types import AgentEvent, EventType

        event = AgentEvent(
            type=EventType.TOOL_CALL,
            data={"tool": "bash", "args": {"command": "rm -rf /"}},
        )

        with pytest.raises(PermissionError, match="Blocked"):
            ext.on_event(event)

    def test_allows_safe_command(self):
        ext = SecurityExtension()
        from src.agent.types import AgentEvent, EventType

        event = AgentEvent(
            type=EventType.TOOL_CALL,
            data={"tool": "bash", "args": {"command": "ls -la"}},
        )

        ext.on_event(event)  # Should not raise

    def test_blocks_shadow_access(self):
        ext = SecurityExtension()
        from src.agent.types import AgentEvent, EventType

        event = AgentEvent(
            type=EventType.TOOL_CALL,
            data={"tool": "read_file", "args": {"path": "/etc/shadow"}},
        )

        with pytest.raises(PermissionError):
            ext.on_event(event)


class TestTimingExtension:
    def test_tracks_llm_timing(self):
        ext = TimingExtension()
        from src.agent.types import AgentEvent, EventType

        ext.on_event(AgentEvent(type=EventType.LLM_CALL, data={}))
        ext.on_event(AgentEvent(type=EventType.LLM_RESPONSE, data={}))

        stats = ext.get_stats()
        assert "llm" in stats
        assert stats["llm"]["count"] == 1

    def test_tracks_tool_timing(self):
        ext = TimingExtension()
        from src.agent.types import AgentEvent, EventType

        ext.on_event(AgentEvent(type=EventType.TOOL_CALL, data={"tool": "bash"}))
        ext.on_event(AgentEvent(type=EventType.TOOL_RESULT, data={"tool": "bash"}))

        stats = ext.get_stats()
        assert "bash" in stats


# ============================================================================
# Type Tests
# ============================================================================

class TestTypes:
    def test_message_creation(self):
        msg = Message(role="user", content=[TextContent(text="hello")])
        assert msg.role == "user"
        assert msg.timestamp > 0

    def test_tool_call_content(self):
        tc = ToolCallContent(id="call_1", name="read_file", arguments={"path": "/tmp"})
        assert tc.type == "toolCall"
        assert tc.name == "read_file"

    def test_llm_response(self):
        resp = LLMResponse(
            content=[TextContent(text="hello")],
            stop_reason="end_turn",
            usage=Usage(input_tokens=10, output_tokens=5, total_tokens=15),
        )
        assert resp.stop_reason == "end_turn"
        assert resp.usage.total_tokens == 15
