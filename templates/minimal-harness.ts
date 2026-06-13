/**
 * Minimal Harness — Hera Architecture Reference
 *
 * Agent Harness is the orchestration layer. It wraps the agent loop with:
 * - Session management
 * - Compaction
 * - Skills & prompt templates
 * - Hook system
 * - Queue management (steer, follow-up, next-turn)
 *
 * Based on packages/agent/src/harness/agent-harness.ts
 */

// ============================================================================
// Types (simplified)
// ============================================================================

interface Message {
  role: "user" | "assistant" | "toolResult";
  content: unknown[];
  timestamp: number;
}

interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Model {
  id: string;
  provider: string;
  contextWindow: number;
}

type HarnessPhase = "idle" | "turn" | "compact" | "fork" | "switch";

// ============================================================================
// Queue
// ============================================================================

class MessageQueue {
  private messages: Message[] = [];
  private mode: "all" | "one-at-a-time";

  constructor(mode: "all" | "one-at-a-time" = "one-at-a-time") {
    this.mode = mode;
  }

  enqueue(message: Message): void {
    this.messages.push(message);
  }

  drain(): Message[] {
    if (this.mode === "all") {
      const drained = [...this.messages];
      this.messages = [];
      return drained;
    }
    if (this.messages.length === 0) return [];
    return [this.messages.shift()!];
  }

  hasItems(): boolean {
    return this.messages.length > 0;
  }

  clear(): void {
    this.messages = [];
  }
}

// ============================================================================
// Session (simplified)
// ============================================================================

class SimpleSession {
  private messages: Message[] = [];

  appendMessage(message: Message): void {
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}

// ============================================================================
// Agent Harness
// ============================================================================

interface HarnessOptions {
  model: Model;
  systemPrompt: string | ((context: { model: Model }) => string);
  tools: Tool[];
  session?: SimpleSession;
}

class AgentHarness {
  private model: Model;
  private systemPrompt: string | ((context: { model: Model }) => string);
  private tools: Map<string, Tool>;
  private session: SimpleSession;
  private phase: HarnessPhase = "idle";
  private steerQueue: MessageQueue;
  private followUpQueue: MessageQueue;
  private nextTurnQueue: Message[] = [];

  constructor(options: HarnessOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = new Map(options.tools.map((t) => [t.name, t]));
    this.session = options.session ?? new SimpleSession();
    this.steerQueue = new MessageQueue("one-at-a-time");
    this.followUpQueue = new MessageQueue("one-at-a-time");
  }

  // --- Core API ---

  async prompt(text: string): Promise<string> {
    if (this.phase !== "idle") throw new Error("Harness is busy");
    this.phase = "turn";

    try {
      // Create user message
      const userMessage: Message = {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      // Prepend next-turn queue
      const messages = [...this.nextTurnQueue.splice(0), userMessage];

      // Build context
      const context = this.buildContext(messages);

      // Run agent loop (simplified)
      const response = await this.runAgentLoop(context);

      // Save to session
      this.session.appendMessage(userMessage);
      this.session.appendMessage(response);

      return this.extractText(response);
    } finally {
      this.phase = "idle";
    }
  }

  // --- Queue API ---

  steer(text: string): void {
    if (this.phase === "idle") throw new Error("Cannot steer while idle");
    this.steerQueue.enqueue({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
  }

  followUp(text: string): void {
    this.followUpQueue.enqueue({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
  }

  // --- Session API ---

  getSession(): SimpleSession {
    return this.session;
  }

  // --- State ---

  getPhase(): HarnessPhase {
    return this.phase;
  }

  // --- Internal ---

  private buildContext(additionalMessages: Message[]): { systemPrompt: string; messages: Message[]; tools: Tool[] } {
    const resolvedPrompt =
      typeof this.systemPrompt === "string" ? this.systemPrompt : this.systemPrompt({ model: this.model });

    return {
      systemPrompt: resolvedPrompt,
      messages: [...this.session.getMessages(), ...additionalMessages],
      tools: [...this.tools.values()],
    };
  }

  private async runAgentLoop(context: {
    systemPrompt: string;
    messages: Message[];
    tools: Tool[];
  }): Promise<Message> {
    // Simplified agent loop — in production, this calls the LLM
    const lastMessage = context.messages[context.messages.length - 1];
    const text = (lastMessage?.content?.[0] as any)?.text ?? "";

    // Simulate LLM response
    return {
      role: "assistant",
      content: [{ type: "text", text: `Response to: "${text}"` }],
      timestamp: Date.now(),
    };
  }

  private extractText(message: Message): string {
    return message.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
  }
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  const harness = new AgentHarness({
    model: { id: "gpt-4", provider: "openai", contextWindow: 128000 },
    systemPrompt: "You are a helpful coding assistant.",
    tools: [
      {
        name: "read",
        description: "Read a file",
        execute: async (args) => `Contents of ${args.path}`,
      },
    ],
  });

  // Basic prompt
  const response1 = await harness.prompt("Hello, what can you do?");
  console.log("Response 1:", response1);

  // Follow-up (queued, runs after agent would stop)
  harness.followUp("Now explain the architecture");

  // Steer (inject mid-run — only works while agent is running)
  // harness.steer("Focus on the session system");

  // Check state
  console.log("Phase:", harness.getPhase());
  console.log("Session messages:", harness.getSession().getMessages().length);
}

main().catch(console.error);
