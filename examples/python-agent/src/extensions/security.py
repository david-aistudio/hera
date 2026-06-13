"""Security extension — blocks dangerous operations."""

from ..agent.types import AgentEvent, EventType


class SecurityExtension:
    """Blocks dangerous tool calls and file access."""

    BLOCKED_COMMANDS = [
        "rm -rf /", "rm -rf /*", "mkfs", "dd if=",
        "curl | sh", "curl | bash", "wget | sh", "wget | bash",
        ":(){:|:&};:",
    ]

    BLOCKED_PATHS = [
        "/etc/shadow", "/etc/passwd", "/etc/sudoers",
        "/proc/kcore", "/dev/sda",
    ]

    def __init__(self, strict: bool = False):
        self.strict = strict
        self.blocked_count = 0

    def on_event(self, event: AgentEvent) -> None:
        if event.type != EventType.TOOL_CALL:
            return

        tool = event.data.get("tool", "")
        args = event.data.get("args", {})

        if tool == "bash":
            command = args.get("command", "")
            for pattern in self.BLOCKED_COMMANDS:
                if pattern in command:
                    self.blocked_count += 1
                    raise PermissionError(f"Blocked dangerous command: {pattern}")

        if tool == "read_file":
            path = args.get("path", "")
            for blocked in self.BLOCKED_PATHS:
                if path.startswith(blocked):
                    self.blocked_count += 1
                    raise PermissionError(f"Blocked access to: {blocked}")

        if tool == "write_file" and self.strict:
            path = args.get("path", "")
            if not path.startswith(("/", "./", "~/")):
                raise PermissionError(f"Strict mode: absolute path required, got: {path}")
