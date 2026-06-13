# Testing Patterns — Hera Architecture Reference

This document covers testing patterns for building reliable AI coding agents.

---

## 1. Unit Tests

### 1.1 Test Tools in Isolation

Tools should be testable without an LLM:

```typescript
import { describe, it, expect } from "vitest";

describe("ReadFileTool", () => {
  const tool = createReadFileTool("/tmp");

  it("reads a file", async () => {
    // Create test file
    await fs.writeFile("/tmp/test.txt", "hello world");

    const result = await tool.execute("call_1", { path: "test.txt" });

    expect(result.content[0].text).toContain("hello world");
    expect(result.details.path).toBe("test.txt");
    expect(result.isError).toBeUndefined();
  });

  it("handles missing file", async () => {
    const result = await tool.execute("call_2", { path: "nonexistent.txt" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("respects offset and limit", async () => {
    await fs.writeFile("/tmp/lines.txt", "1\n2\n3\n4\n5");

    const result = await tool.execute("call_3", {
      path: "lines.txt",
      offset: 2,
      limit: 2,
    });

    expect(result.content[0].text).toContain("2");
    expect(result.content[0].text).toContain("3");
    expect(result.content[0].text).not.toContain("1");
  });
});
```

### 1.2 Test Message Conversion

```typescript
describe("convertToLlm", () => {
  it("converts bashExecution to user message", () => {
    const messages: AgentMessage[] = [
      {
        role: "bashExecution",
        command: "ls",
        output: "file1.txt\nfile2.txt",
        exitCode: 0,
        cancelled: false,
        truncated: false,
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content[0].text).toContain("ls");
    expect(result[0].content[0].text).toContain("file1.txt");
  });

  it("filters out excludeFromContext messages", () => {
    const messages: AgentMessage[] = [
      {
        role: "bashExecution",
        command: "secret",
        output: "sensitive data",
        exitCode: 0,
        cancelled: false,
        truncated: false,
        timestamp: Date.now(),
        excludeFromContext: true,
      },
    ];

    const result = convertToLlm(messages);
    expect(result).toHaveLength(0);
  });

  it("passes through standard messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() },
    ];

    const result = convertToLlm(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });
});
```

### 1.3 Test Session Storage

```typescript
describe("InMemorySessionStorage", () => {
  it("appends and retrieves entries", () => {
    const storage = new InMemorySessionStorage();

    const id = storage.appendEntry({
      type: "message",
      data: { message: { role: "user", content: "hello" } },
    });

    const entry = storage.getEntry(id);
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("message");
  });

  it("builds path to root", () => {
    const storage = new InMemorySessionStorage();

    const id1 = storage.appendEntry({ type: "message", data: { m: 1 } });
    const id2 = storage.appendEntry({ type: "message", data: { m: 2 } });
    const id3 = storage.appendEntry({ type: "message", data: { m: 3 } });

    const path = storage.getPathToRoot(id3);
    expect(path).toHaveLength(3);
    expect(path[0].id).toBe(id1);
    expect(path[2].id).toBe(id3);
  });

  it("handles branching", () => {
    const storage = new InMemorySessionStorage();

    storage.appendEntry({ type: "message", data: { m: 1 } });
    storage.appendEntry({ type: "message", data: { m: 2 } });
    const branchId = storage.fork("branch");
    storage.appendEntry({ type: "message", data: { m: 3 } });

    // Main branch has 3 messages + fork
    const mainBranch = storage.getBranch();
    expect(mainBranch.filter((e) => e.type === "message")).toHaveLength(3);

    // Switch to branch
    storage.switchToBranch(branchId);
  });
});
```

---

## 2. Integration Tests

### 2.1 Test Agent Loop End-to-End

```typescript
describe("Agent Loop", () => {
  it("completes a simple conversation", async () => {
    const context: AgentContext = {
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      tools: [],
    };

    // Mock LLM
    const mockLLM = async () => ({
      content: [{ type: "text", text: "Hi there!" }],
      stopReason: "end_turn",
    });

    const messages = await agentLoop(context, mockLLM);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
  });

  it("executes tools and loops back", async () => {
    const tools = [
      {
        name: "read",
        description: "Read file",
        execute: async () => "file contents",
      },
    ];

    const context: AgentContext = {
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Read file" }] }],
      tools,
    };

    let callCount = 0;
    const mockLLM = async () => {
      callCount++;
      if (callCount === 1) {
        // First call: request tool
        return {
          content: [
            { type: "text", text: "Reading..." },
            { type: "toolCall", id: "call_1", name: "read", arguments: { path: "test.txt" } },
          ],
          stopReason: "tool_use",
        };
      }
      // Second call: respond with result
      return {
        content: [{ type: "text", text: "Here are the contents" }],
        stopReason: "end_turn",
      };
    };

    const messages = await agentLoop(context, mockLLM);
    expect(messages.length).toBeGreaterThan(1);
    expect(callCount).toBe(2);
  });
});
```

### 2.2 Test Tool Execution Flow

```typescript
describe("Tool Execution", () => {
  it("executes tools in parallel by default", async () => {
    const executionOrder: string[] = [];

    const tools = [
      {
        name: "slow",
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          executionOrder.push("slow");
          return "done";
        },
      },
      {
        name: "fast",
        execute: async () => {
          executionOrder.push("fast");
          return "done";
        },
      },
    ];

    // In parallel mode, fast should finish before slow
    await executeToolsParallel(tools, []);
    expect(executionOrder).toEqual(["fast", "slow"]);
  });

  it("executes tools sequentially when specified", async () => {
    const executionOrder: string[] = [];

    const tools = [
      {
        name: "first",
        executionMode: "sequential" as const,
        execute: async () => {
          executionOrder.push("first");
          return "done";
        },
      },
      {
        name: "second",
        executionMode: "sequential" as const,
        execute: async () => {
          executionOrder.push("second");
          return "done";
        },
      },
    ];

    await executeToolsSequential(tools, []);
    expect(executionOrder).toEqual(["first", "second"]);
  });
});
```

---

## 3. Mock Patterns

### 3.1 Mock LLM Provider

```typescript
function createMockProvider(responses: AssistantMessage[]): ProviderHandler {
  let callIndex = 0;

  return (model, context, options) => {
    const stream = new EventStream<StreamEvent, AssistantMessage>();
    const response = responses[callIndex % responses.length];
    callIndex++;

    (async () => {
      stream.push({ type: "start", partial: response });
      stream.push({ type: "done", message: response });
      stream.end(response);
    })();

    return stream;
  };
}

// Usage
const mockProvider = createMockProvider([
  {
    role: "assistant",
    content: [{ type: "text", text: "Hello!" }],
    model: "mock",
    provider: "mock",
    usage: { input: 10, output: 5, totalTokens: 15 },
    stopReason: "end_turn",
    timestamp: Date.now(),
  },
]);
```

### 3.2 Mock Tools

```typescript
function createMockTool(name: string, responses: string[]): Tool {
  let callIndex = 0;

  return {
    name,
    description: `Mock ${name} tool`,
    execute: async (args) => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return response;
    },
  };
}

// Usage
const mockReadTool = createMockTool("read", [
  "file contents line 1\nfile contents line 2",
  "another file contents",
]);
```

### 3.3 Mock Session Storage

```typescript
class MockSessionStorage implements SessionStorage {
  private entries: SessionEntry[] = [];
  private leafId: string | null = null;

  appendEntry(entry: Omit<SessionEntry, "id" | "parentId">): string {
    const id = `mock_${this.entries.length}`;
    this.entries.push({ ...entry, id, parentId: this.leafId });
    this.leafId = id;
    return id;
  }

  getEntry(id: string): SessionEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  getPathToRoot(leafId: string): SessionEntry[] {
    const path: SessionEntry[] = [];
    let current = this.entries.find((e) => e.id === leafId);
    while (current) {
      path.unshift(current);
      current = this.entries.find((e) => e.id === current!.parentId);
    }
    return path;
  }
}
```

---

## 4. Test Fixtures

### 4.1 Sample Conversations

```typescript
const FIXTURES = {
  simpleConversation: [
    { role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
    { role: "assistant", content: [{ type: "text", text: "Hi!" }], timestamp: 2 },
  ],

  toolCallConversation: [
    { role: "user", content: [{ type: "text", text: "Read file" }], timestamp: 1 },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Reading..." },
        { type: "toolCall", id: "call_1", name: "read", arguments: { path: "test.txt" } },
      ],
      timestamp: 2,
    },
    {
      role: "toolResult",
      content: [{ toolCallId: "call_1", content: [{ type: "text", text: "contents" }], isError: false }],
      timestamp: 3,
    },
    { role: "assistant", content: [{ type: "text", text: "Here are the contents" }], timestamp: 4 },
  ],

  errorConversation: [
    { role: "user", content: [{ type: "text", text: "Do something" }], timestamp: 1 },
    {
      role: "assistant",
      content: [{ type: "text", text: "" }],
      stopReason: "error",
      errorMessage: "Provider unavailable",
      timestamp: 2,
    },
  ],
};
```

### 4.2 Sample Tool Results

```typescript
const TOOL_RESULTS = {
  success: {
    content: [{ type: "text", text: "Operation completed" }],
    details: { success: true },
  },

  error: {
    content: [{ type: "text", text: "File not found" }],
    details: { error: "ENOENT" },
    isError: true,
  },

  terminate: {
    content: [{ type: "text", text: "User input required" }],
    details: { waiting: true },
    terminate: true,
  },
};
```

---

## 5. E2E Tests

### 5.1 Test Full Conversation Flow

```typescript
describe("E2E Agent", () => {
  it("handles multi-turn conversation", async () => {
    const agent = createTestAgent({
      provider: createMockProvider([
        { content: [{ type: "text", text: "I can help with files" }], stopReason: "end_turn" },
        { content: [{ type: "text", text: "Reading file..." }], stopReason: "end_turn" },
      ]),
    });

    // Turn 1
    const response1 = await agent.prompt("What can you do?");
    expect(response1).toContain("files");

    // Turn 2
    const response2 = await agent.prompt("Read README.md");
    expect(response2).toContain("Reading");
  });

  it("recovers from errors", async () => {
    let failCount = 0;
    const agent = createTestAgent({
      provider: async () => {
        if (failCount < 2) {
          failCount++;
          throw new Error("503 Service Unavailable");
        }
        return createMockProvider([{
          content: [{ type: "text", text: "Success!" }],
          stopReason: "end_turn",
        }])({} as any, {} as any, {} as any);
      },
    });

    const response = await agent.prompt("Hello");
    expect(response).toContain("Success");
  });
});
```

---

## Checklist

- [ ] Unit tests for all tools
- [ ] Unit tests for message conversion
- [ ] Unit tests for session storage
- [ ] Integration tests for agent loop
- [ ] Integration tests for tool execution
- [ ] Mock LLM provider for testing
- [ ] Mock tools for testing
- [ ] Mock session storage for testing
- [ ] Test fixtures for common scenarios
- [ ] E2E tests for full conversation flow
- [ ] E2E tests for error recovery
- [ ] Tests for abort handling
