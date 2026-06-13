"""Read file tool."""

import os
from ..agent.types import ToolDefinition, ToolParameter


class ReadFileTool:
    name = "read_file"
    description = "Read the contents of a file"

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="read_file",
            description="Read the contents of a file at the given path",
            parameters=[
                ToolParameter(
                    name="path",
                    type="string",
                    description="Absolute or relative path to the file",
                    required=True,
                ),
                ToolParameter(
                    name="encoding",
                    type="string",
                    description="File encoding (default: utf-8)",
                ),
            ],
        )

    def execute(self, args: dict) -> str:
        path = args.get("path", "")
        encoding = args.get("encoding", "utf-8")

        if not path:
            return "Error: path is required"

        # Resolve relative paths
        path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.abspath(path)

        if not os.path.exists(path):
            return f"Error: file not found: {path}"

        if os.path.isdir(path):
            return f"Error: {path} is a directory, not a file"

        try:
            with open(path, encoding=encoding) as f:
                content = f.read()

            # Add line numbers
            lines = content.split("\n")
            numbered = [f"{i+1:4d}| {line}" for i, line in enumerate(lines)]
            return "\n".join(numbered)

        except UnicodeDecodeError:
            return f"Error: cannot read {path} as {encoding} (binary file?)"
        except PermissionError:
            return f"Error: permission denied: {path}"
