/**
 * Minimal Extension — Hera Architecture Reference
 *
 * Extensions are plugins that can:
 * - Register tools
 * - Register commands
 * - Subscribe to lifecycle events
 * - Interact with UI
 *
 * Based on packages/coding-agent/src/core/extensions/
 */

// ============================================================================
// Types
// ============================================================================

interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Command {
  name: string;
  description: string;
  execute: (args: string[]) => Promise<string>;
}

type EventType =
  | "before_agent_start"
  | "after_agent_end"
  | "before_tool_call"
  | "after_tool_call"
  | "message_end";

interface ExtensionEvent {
  type: EventType;
  data: unknown;
}

interface UIContext {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  select(title: string, options: string[]): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
}

interface ExtensionContext {
  // Registration
  registerTool(tool: Tool): void;
  registerCommand(command: Command): void;

  // Events
  on(type: EventType, handler: (event: ExtensionEvent) => void): () => void;

  // UI
  ui: UIContext;

  // Agent state
  getPhase(): string;
}

// ============================================================================
// Extension Interface
// ============================================================================

interface Extension {
  name: string;
  description: string;
  version?: string;

  activate(ctx: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ============================================================================
// Example: Logging Extension
// ============================================================================

function createLoggingExtension(): Extension {
  return {
    name: "logging",
    description: "Logs all agent events to console",
    version: "1.0.0",

    activate(ctx) {
      ctx.on("before_agent_start", (event) => {
        console.log(`[LOG] Agent started at ${new Date().toISOString()}`);
      });

      ctx.on("after_agent_end", (event) => {
        console.log(`[LOG] Agent ended at ${new Date().toISOString()}`);
      });

      ctx.on("before_tool_call", (event) => {
        const data = event.data as any;
        console.log(`[LOG] Tool call: ${data.toolName}(${JSON.stringify(data.args)})`);
      });

      ctx.on("after_tool_call", (event) => {
        const data = event.data as any;
        console.log(`[LOG] Tool result: ${data.toolName} (error: ${data.isError})`);
      });
    },
  };
}

// ============================================================================
// Example: Custom Tool Extension
// ============================================================================

function createWeatherExtension(): Extension {
  return {
    name: "weather",
    description: "Adds weather lookup tool",
    version: "1.0.0",

    activate(ctx) {
      // Register tool
      ctx.registerTool({
        name: "get_weather",
        description: "Get current weather for a location",
        execute: async (args) => {
          const location = args.location as string;
          // In production, call weather API
          return `Weather in ${location}: 72°F, sunny`;
        },
      });

      // Register command
      ctx.registerCommand({
        name: "weather",
        description: "Check weather for a location",
        execute: async (args) => {
          const location = args[0] ?? "unknown";
          return `Current weather in ${location}: 72°F, sunny`;
        },
      });
    },
  };
}

// ============================================================================
// Example: Guard Extension (Security)
// ============================================================================

function createSecurityGuardExtension(): Extension {
  const BLOCKED_COMMANDS = ["rm -rf", "format", "mkfs"];
  const BLOCKED_PATHS = ["/etc/passwd", "/etc/shadow", "~/.ssh"];

  return {
    name: "security-guard",
    description: "Blocks dangerous tool calls",
    version: "1.0.0",

    activate(ctx) {
      ctx.on("before_tool_call", (event) => {
        const data = event.data as any;

        // Block dangerous bash commands
        if (data.toolName === "bash") {
          const command = data.args?.command as string;
          for (const blocked of BLOCKED_COMMANDS) {
            if (command?.includes(blocked)) {
              ctx.ui.notify(`Blocked dangerous command: ${blocked}`, "error");
              // In production, this would prevent the tool call
              throw new Error(`Blocked: command contains "${blocked}"`);
            }
          }
        }

        // Block reading sensitive files
        if (data.toolName === "read") {
          const path = data.args?.path as string;
          for (const blocked of BLOCKED_PATHS) {
            if (path?.startsWith(blocked)) {
              ctx.ui.notify(`Blocked access to sensitive path: ${blocked}`, "error");
              throw new Error(`Blocked: cannot read "${blocked}"`);
            }
          }
        }
      });
    },
  };
}

// ============================================================================
// Extension Runner
// ============================================================================

class ExtensionRunner {
  private extensions: Extension[] = [];
  private tools: Map<string, Tool> = new Map();
  private commands: Map<string, Command> = new Map();
  private eventHandlers: Map<EventType, Set<(event: ExtensionEvent) => void>> = new Map();

  async load(extensions: Extension[]): Promise<void> {
    this.extensions = extensions;

    const ctx: ExtensionContext = {
      registerTool: (tool) => this.tools.set(tool.name, tool),
      registerCommand: (cmd) => this.commands.set(cmd.name, cmd),
      on: (type, handler) => {
        if (!this.eventHandlers.has(type)) {
          this.eventHandlers.set(type, new Set());
        }
        this.eventHandlers.get(type)!.add(handler);
        return () => this.eventHandlers.get(type)?.delete(handler);
      },
      ui: {
        notify: (msg, type = "info") => console.log(`[${type.toUpperCase()}] ${msg}`),
        select: async (title, options) => options[0],
        confirm: async (title, msg) => true,
      },
      getPhase: () => "idle",
    };

    for (const ext of this.extensions) {
      await ext.activate(ctx);
    }
  }

  async emit(type: EventType, data: unknown): Promise<void> {
    const handlers = this.eventHandlers.get(type);
    if (!handlers) return;

    for (const handler of handlers) {
      await handler({ type, data });
    }
  }

  getTools(): Tool[] {
    return [...this.tools.values()];
  }

  getCommands(): Command[] {
    return [...this.commands.values()];
  }
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  const runner = new ExtensionRunner();

  // Load extensions
  await runner.load([
    createLoggingExtension(),
    createWeatherExtension(),
    createSecurityGuardExtension(),
  ]);

  // Emit events
  await runner.emit("before_agent_start", {});

  // Use registered tools
  const tools = runner.getTools();
  console.log("Registered tools:", tools.map((t) => t.name));

  // Use registered commands
  const commands = runner.getCommands();
  console.log("Registered commands:", commands.map((c) => c.name));

  // Try calling a tool
  const weatherTool = tools.find((t) => t.name === "get_weather");
  if (weatherTool) {
    const result = await weatherTool.execute({ location: "Jakarta" });
    console.log("Weather result:", result);
  }

  await runner.emit("after_agent_end", {});
}

main().catch(console.error);
