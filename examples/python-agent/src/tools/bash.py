"""Bash tool — execute shell commands."""

import subprocess
import os
from ..agent.types import ToolDefinition, ToolParameter


class BashTool:
    name = "bash"
    description = "Execute a shell command"

    BLOCKED_PATTERNS = [
        "rm -rf /",
        "mkfs",
        "dd if=",
        "curl | sh",
        "curl | bash",
        "wget | sh",
        "wget | bash",
        ":(){:|:&};:",  # fork bomb
    ]

    def __init__(self, working_dir: str = ".", timeout: int = 30):
        self.working_dir = working_dir
        self.timeout = timeout

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="bash",
            description="Execute a shell command and return stdout+stderr",
            parameters=[
                ToolParameter(
                    name="command",
                    type="string",
                    description="Shell command to execute",
                    required=True,
                ),
                ToolParameter(
                    name="timeout",
                    type="number",
                    description="Timeout in seconds (default: 30)",
                ),
            ],
        )

    def execute(self, args: dict) -> str:
        command = args.get("command", "")
        timeout = args.get("timeout", self.timeout)

        if not command:
            return "Error: command is required"

        # Security check
        for pattern in self.BLOCKED_PATTERNS:
            if pattern in command:
                return f"Error: blocked dangerous command pattern: {pattern}"

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.working_dir,
            )

            output = ""
            if result.stdout:
                output += result.stdout
            if result.stderr:
                output += f"\n[stderr]\n{result.stderr}"
            if result.returncode != 0:
                output += f"\n[exit code: {result.returncode}]"

            return output.strip() or "(no output)"

        except subprocess.TimeoutExpired:
            return f"Error: command timed out after {timeout}s"
        except Exception as e:
            return f"Error executing command: {e}"
