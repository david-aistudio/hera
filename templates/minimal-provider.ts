/**
 * Minimal Provider — Hera Architecture Reference
 *
 * LLM provider abstraction. Pi supports 20+ providers through a unified API.
 * Based on packages/ai/src/providers/ and packages/ai/src/types.ts
 *
 * The key insight: all providers implement the same streaming interface.
 * This allows swapping providers without changing agent code.
 */

// ============================================================================
// Types
// ============================================================================

interface TextContent {
  type: "text";
  text: string;
}

interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ToolCallContent)[];
  model: string;
  provider: string;
  usage: {
    input: number;
    output: number;
    totalTokens: number;
  };
  stopReason: "end_turn" | "tool_use" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

interface UserMessage {
  role: "user";
  content: TextContent[];
  timestamp: number;
}

interface ToolResultMessage {
  role: "toolResult";
  content: { toolCallId: string; content: TextContent[]; isError: boolean }[];
  timestamp: number;
}

type Message = UserMessage | AssistantMessage | ToolResultMessage;

interface Context {
  systemPrompt: string;
  messages: Message[];
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
}

interface Model {
  id: string;
  name: string;
  provider: string;
  api: string;
  baseUrl: string;
  contextWindow: number;
  maxTokens: number;
}

interface StreamOptions {
  apiKey?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
}

// ============================================================================
// Streaming Events
// ============================================================================

type StreamEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_delta"; partial: AssistantMessage }
  | { type: "toolcall_delta"; partial: AssistantMessage }
  | { type: "done"; message: AssistantMessage }
  | { type: "error"; error: AssistantMessage };

// ============================================================================
// Event Stream (async iterator)
// ============================================================================

class EventStream<T, R> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;
  private resultPromise: Promise<R>;
  private resolveResult!: (result: R) => void;

  constructor() {
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  push(event: T): void {
    if (this.done) return;
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(result: R): void {
    this.done = true;
    this.resolveResult(result);
    while (this.waiting.length > 0) {
      this.waiting.shift()!({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        await new Promise<IteratorResult<T>>((resolve) => this.waiting.push(resolve));
      }
    }
  }

  result(): Promise<R> {
    return this.resultPromise;
  }
}

// ============================================================================
// Provider Interface
// ============================================================================

type ProviderHandler = (
  model: Model,
  context: Context,
  options: StreamOptions,
) => EventStream<StreamEvent, AssistantMessage>;

// ============================================================================
// OpenAI Provider Implementation
// ============================================================================

function createOpenAIProvider(): ProviderHandler {
  return (model, context, options) => {
    const stream = new EventStream<StreamEvent, AssistantMessage>();

    // Build request payload
    const payload = {
      model: model.id,
      messages: [
        { role: "system", content: context.systemPrompt },
        ...context.messages.map((m) => {
          if (m.role === "user") return { role: "user", content: m.content[0]?.text ?? "" };
          if (m.role === "assistant") return { role: "assistant", content: m.content[0]?.text ?? "" };
          return { role: "user", content: JSON.stringify(m.content) };
        }),
      ],
      tools: context.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    // In production, this would be an actual HTTP request
    // For this example, simulate the streaming response
    (async () => {
      const message: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "This is a simulated response from OpenAI." }],
        model: model.id,
        provider: "openai",
        usage: { input: 100, output: 50, totalTokens: 150 },
        stopReason: "end_turn",
        timestamp: Date.now(),
      };

      stream.push({ type: "start", partial: message });
      await new Promise((r) => setTimeout(r, 50));
      stream.push({ type: "text_delta", partial: message });
      await new Promise((r) => setTimeout(r, 50));
      stream.push({ type: "done", message });
      stream.end(message);
    })();

    return stream;
  };
}

// ============================================================================
// Provider Registry
// ============================================================================

class ProviderRegistry {
  private providers = new Map<string, ProviderHandler>();

  register(api: string, handler: ProviderHandler): void {
    this.providers.set(api, handler);
  }

  get(api: string): ProviderHandler | undefined {
    return this.providers.get(api);
  }

  async stream(
    model: Model,
    context: Context,
    options: StreamOptions,
  ): Promise<EventStream<StreamEvent, AssistantMessage>> {
    const handler = this.providers.get(model.api);
    if (!handler) {
      throw new Error(`No provider registered for API: ${model.api}`);
    }
    return handler(model, context, options);
  }
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  const registry = new ProviderRegistry();

  // Register OpenAI provider
  registry.register("openai-chat", createOpenAIProvider());

  // Define model
  const model: Model = {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    api: "openai-chat",
    baseUrl: "https://api.openai.com/v1",
    contextWindow: 128000,
    maxTokens: 4096,
  };

  // Create context
  const context: Context = {
    systemPrompt: "You are a helpful assistant.",
    messages: [
      { role: "user", content: [{ type: "text", text: "Hello!" }], timestamp: Date.now() },
    ],
  };

  // Stream response
  const stream = await registry.stream(model, context, { apiKey: "sk-..." });

  for await (const event of stream) {
    switch (event.type) {
      case "start":
        console.log("[Start] Streaming began");
        break;
      case "text_delta":
        console.log("[Text]", event.partial.content[0]?.text);
        break;
      case "done":
        console.log("[Done] Total tokens:", event.message.usage.totalTokens);
        break;
      case "error":
        console.error("[Error]", event.error.errorMessage);
        break;
    }
  }
}

main().catch(console.error);
