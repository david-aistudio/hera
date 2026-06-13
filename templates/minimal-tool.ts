/**
 * Minimal Tool — Hera Architecture Reference
 *
 * This shows how to create a tool that the agent can call.
 * Based on Pi Agent's tool system (packages/coding-agent/src/core/tools/)
 *
 * Tools in Pi have:
 * - name, label, description
 * - parameters (TypeBox schema)
 * - execute() function
 * - Optional: prepareArguments(), executionMode
 */

// ============================================================================
// Types (simplified from Pi)
// ============================================================================

interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

interface ToolResult<T = unknown> {
  content: (TextContent | ImageContent)[];
  details: T;
  terminate?: boolean; // If true, agent stops after this tool batch
}

interface ToolUpdateCallback<T = unknown> {
  (partial: ToolResult<T>): void;
}

interface ToolDefinition<TParams = Record<string, unknown>, TDetails = unknown> {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  toolSnippet: string; // One-line description for system prompt
  execute: (
    toolCallId: string,
    params: TParams,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateCallback<TDetails>,
  ) => Promise<ToolResult<TDetails>>;
  executionMode?: "sequential" | "parallel";
}

// ============================================================================
// Example: Read File Tool
// ============================================================================

interface ReadFileParams {
  path: string;
  offset?: number;
  limit?: number;
}

interface ReadFileDetails {
  path: string;
  totalLines: number;
  returnedLines: number;
}

function createReadFileTool(cwd: string): ToolDefinition<ReadFileParams, ReadFileDetails> {
  return {
    name: "read",
    label: "Read File",
    description: "Read the contents of a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
        offset: { type: "number", description: "Line to start from (1-indexed)", default: 1 },
        limit: { type: "number", description: "Max lines to return", default: 500 },
      },
      required: ["path"],
    },
    toolSnippet: "read: Read file contents with line numbers",

    execute: async (toolCallId, params, signal, onUpdate) => {
      const { path, offset = 1, limit = 500 } = params;

      // Check abort signal
      signal?.throwIfAborted();

      // In production, read actual file
      // For this example, simulate
      const fullPath = `${cwd}/${path}`;
      const content = `// Contents of ${fullPath}\n// Lines ${offset} to ${offset + limit - 1}\n\nexport function hello() {\n  return "world";\n}`;
      const totalLines = 100;

      // Stream partial update (for long reads)
      onUpdate?.({
        content: [{ type: "text", text: `Reading ${path}...` }],
        details: { path, totalLines, returnedLines: 5 },
      });

      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        content: [{ type: "text", text: content }],
        details: {
          path,
          totalLines,
          returnedLines: Math.min(limit, totalLines - offset + 1),
        },
      };
    },

    executionMode: "parallel", // Can run concurrently with other tools
  };
}

// ============================================================================
// Example: Bash Tool (sequential — side effects)
// ============================================================================

interface BashParams {
  command: string;
  timeout?: number;
}

interface BashDetails {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function createBashTool(cwd: string): ToolDefinition<BashParams, BashDetails> {
  return {
    name: "bash",
    label: "Bash",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        timeout: { type: "number", description: "Timeout in seconds", default: 30 },
      },
      required: ["command"],
    },
    toolSnippet: "bash: Execute shell commands",

    execute: async (toolCallId, params, signal) => {
      const { command, timeout = 30 } = params;

      // In production, use child_process
      // For this example, simulate
      const result: BashDetails = {
        command,
        exitCode: 0,
        stdout: `Output of: ${command}`,
        stderr: "",
      };

      return {
        content: [
          {
            type: "text",
            text: result.exitCode === 0 ? result.stdout : `Error (code ${result.exitCode}): ${result.stderr}`,
          },
        ],
        details: result,
      };
    },

    executionMode: "sequential", // Must run one at a time (side effects)
  };
}

// ============================================================================
// Example: Tool with Termination
// ============================================================================

interface AskUserParams {
  question: string;
}

function createAskUserTool(): ToolDefinition<AskUserParams, { answered: boolean }> {
  return {
    name: "ask_user",
    label: "Ask User",
    description: "Ask the user a question and wait for response",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "Question to ask" },
      },
      required: ["question"],
    },
    toolSnippet: "ask_user: Ask user a question",

    execute: async (toolCallId, params) => {
      return {
        content: [{ type: "text", text: `User answered: [response to "${params.question}"]` }],
        details: { answered: true },
        terminate: true, // Stop agent after this — wait for user input
      };
    },
  };
}

// ============================================================================
// Export
// ============================================================================

export { createReadFileTool, createBashTool, createAskUserTool };
export type { ToolDefinition, ToolResult, ToolUpdateCallback };
