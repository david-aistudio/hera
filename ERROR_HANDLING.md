# Error Handling Patterns — Hera Architecture Reference

This document covers error handling patterns for building resilient AI coding agents.

---

## 1. Retry Patterns

### 1.1 Exponential Backoff

Retry transient failures with increasing delays:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryableErrors?: string[];
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableErrors = ["429", "503", "ECONNRESET", "ETIMEDOUT"],
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if retryable
      const isRetryable = retryableErrors.some(
        (code) => lastError!.message.includes(code) || lastError!.name === code,
      );

      if (!isRetryable || attempt === maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * 0.1 * Math.random(); // 10% jitter
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError!;
}
```

### 1.2 Provider-Specific Retries

LLM providers have specific retry requirements:

```typescript
async function callProviderWithRetry(
  provider: ProviderHandler,
  model: Model,
  context: Context,
  options: StreamOptions,
): Promise<AssistantMessage> {
  return withRetry(
    async () => {
      const stream = provider(model, context, options);
      return await stream.result();
    },
    {
      maxAttempts: 3,
      retryableErrors: [
        "429",           // Rate limited
        "503",           // Service unavailable
        "529",           // Overloaded
        "ECONNRESET",    // Connection reset
        "ETIMEDOUT",     // Timeout
        "timeout",       // Generic timeout
      ],
    },
  );
}
```

---

## 2. Graceful Degradation

### 2.1 Fallback to Simpler Model

If primary model fails, try a simpler one:

```typescript
async function callWithFallback(
  primary: { model: Model; handler: ProviderHandler },
  fallback: { model: Model; handler: ProviderHandler },
  context: Context,
  options: StreamOptions,
): Promise<AssistantMessage> {
  try {
    return await callProviderWithRetry(primary.handler, primary.model, context, options);
  } catch (primaryError) {
    console.warn(`Primary model failed: ${primaryError}. Falling back to ${fallback.model.id}`);
    return await callProviderWithRetry(fallback.handler, fallback.model, context, options);
  }
}
```

### 2.2 Skip Non-Critical Tools

If a tool fails, skip it and continue:

```typescript
async function executeToolsWithGracefulDegradation(
  toolCalls: ToolCall[],
  tools: Map<string, Tool>,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of toolCalls) {
    const tool = tools.get(call.name);
    if (!tool) {
      results.push({
        toolCallId: call.id,
        content: [{ type: "text", text: `Tool "${call.name}" not available` }],
        isError: true,
      });
      continue;
    }

    try {
      const result = await tool.execute(call.arguments);
      results.push(result);
    } catch (error) {
      // Non-critical tool failed — log and continue
      console.warn(`Tool ${call.name} failed: ${error}`);
      results.push({
        toolCallId: call.id,
        content: [{ type: "text", text: `Tool failed: ${error}` }],
        isError: true,
      });
    }
  }

  return results;
}
```

### 2.3 Return Partial Results

If some operations succeed, return what you have:

```typescript
interface BatchResult<T> {
  succeeded: T[];
  failed: { item: unknown; error: Error }[];
  total: number;
}

async function executeBatch<T>(
  items: T[],
  fn: (item: T) => Promise<T>,
): Promise<BatchResult<T>> {
  const succeeded: T[] = [];
  const failed: { item: T; error: Error }[] = [];

  for (const item of items) {
    try {
      const result = await fn(item);
      succeeded.push(result);
    } catch (error) {
      failed.push({
        item,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { succeeded, failed, total: items.length };
}
```

---

## 3. Error Propagation

### 3.1 Tool Errors → Error Tool Result

Tool errors should become error tool results, not exceptions:

```typescript
async function executeToolSafely(
  tool: Tool,
  toolCallId: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    signal?.throwIfAborted();
    return await tool.execute(args);
  } catch (error) {
    // Convert to error tool result (never throw)
    return {
      toolCallId,
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}
```

### 3.2 Provider Errors → Error Message

Provider errors should become error messages in the conversation:

```typescript
function createErrorMessage(model: Model, error: Error): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    model: model.id,
    provider: model.provider,
    usage: { input: 0, output: 0, totalTokens: 0 },
    stopReason: "error",
    errorMessage: error.message,
    timestamp: Date.now(),
  };
}
```

### 3.3 Session Errors → Graceful Recovery

Session errors should not crash the agent:

```typescript
async function appendMessageSafely(
  session: Session,
  message: Message,
): Promise<void> {
  try {
    await session.appendMessage(message);
  } catch (error) {
    console.error(`Failed to save message: ${error}`);
    // Continue without saving — agent still works
    // In production: queue for retry
  }
}
```

---

## 4. User-Facing Errors

### 4.1 Human-Readable Messages

Don't expose raw errors to users:

```typescript
function userFacingError(error: Error): string {
  const message = error.message;

  // Map technical errors to user-friendly messages
  if (message.includes("429")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (message.includes("401") || message.includes("403")) {
    return "Authentication failed. Please check your API key.";
  }
  if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
    return "Request timed out. The server might be overloaded.";
  }
  if (message.includes("ECONNREFUSED")) {
    return "Cannot connect to the server. Please check your network.";
  }

  return "Something went wrong. Please try again.";
}
```

### 4.2 Error Codes

Use error codes for debugging:

```typescript
enum ErrorCode {
  PROVIDER_ERROR = "PROVIDER_ERROR",
  TOOL_ERROR = "TOOL_ERROR",
  SESSION_ERROR = "SESSION_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  ABORT_ERROR = "ABORT_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
}

interface AgentError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  cause?: Error;
  context?: Record<string, unknown>;
}
```

---

## 5. Abort Handling

### 5.1 Respect AbortSignal

Always check the abort signal:

```typescript
async function longRunningOperation(signal?: AbortSignal): Promise<void> {
  for (let i = 0; i < 100; i++) {
    // Check signal frequently
    signal?.throwIfAborted();

    await doWork(i);
  }
}
```

### 5.2 Cleanup on Abort

Clean up resources when aborted:

```typescript
async function withCleanup<T>(
  fn: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      await cleanup();
    }
    throw error;
  }
}
```

---

## 6. Recovery Patterns

### 6.1 Session Recovery

Recover session state after crash:

```typescript
async function recoverSession(sessionPath: string): Promise<Session | null> {
  try {
    const data = await fs.readFile(sessionPath, "utf-8");
    const entries = JSON.parse(data) as SessionEntry[];
    return new Session(new InMemorySessionStorage({ entries }));
  } catch (error) {
    console.error(`Failed to recover session: ${error}`);
    return null;
  }
}
```

### 6.2 Context Recovery

Recover context after compaction failure:

```typescript
async function recoverContext(session: Session): Promise<Message[]> {
  try {
    const context = session.buildContext();
    return context.messages as Message[];
  } catch (error) {
    console.error(`Failed to build context: ${error}`);
    // Return last N messages as fallback
    const entries = session.getBranch();
    return entries
      .filter((e) => e.type === "message")
      .slice(-10)
      .map((e) => (e.data as any).message);
  }
}
```

---

## Checklist

- [ ] Retry with exponential backoff for transient failures
- [ ] Fallback to simpler model on primary failure
- [ ] Skip non-critical tools on failure
- [ ] Return partial results when possible
- [ ] Tool errors become error tool results (not exceptions)
- [ ] Provider errors become error messages
- [ ] Session errors don't crash the agent
- [ ] User-facing errors are human-readable
- [ ] Error codes for debugging
- [ ] AbortSignal respected throughout
- [ ] Cleanup on abort
- [ ] Session recovery after crash
