"""Write file tool."""

import os
from ..agent.types import ToolDefinition, ToolParameter


class WriteFileTool:
    name = "write_file"
    description = "Write content to a file"

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="write_file",
            description="Write content to a file. Creates parent directories if needed.",
            parameters=[
                ToolParameter(name="path", type="string", description="File path", required=True),
                ToolParameter(name="content", type="string", description="Content to write", required=True),
            ],
        )

    def execute(self, args: dict) -> str:
        path = args.get("path", "")
        content = args.get("content", "")

        if not path:
            return "Error: path is required"

        path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.abspath(path)

        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(content)
            return f"Wrote {len(content)} bytes to {path}"
        except PermissionError:
            return f"Error: permission denied: {path}"
        except Exception as e:
            return f"Error writing {path}: {e}"
