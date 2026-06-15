import { describe, it, expect, beforeEach, vi } from "vitest";
import { MCPClient, MCPHttpTransport } from "../../templates/mcp-client.js";
import { MCPServer } from "../../templates/mcp-server.js";
import { MCPMarketplace, DEFAULT_MCP_REGISTRY } from "../../templates/mcp-marketplace.js";
import { smartFilterText, defaultMCPFilter } from "../../templates/mcp-stdio-sse-bridge.js";

// ============================================================
// MCP SERVER (in-process, no I/O)
// ============================================================
describe("MCPServer", () => {
  let server: MCPServer;

  beforeEach(() => {
    server = new MCPServer({ name: "test-server", version: "1.0.0" });
  });

  it("registers and lists tools", () => {
    server.registerTool({
      name: "echo",
      description: "Echo input",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      handler: ({ text }) => ({ content: [{ type: "text", text: String(text) }] }),
    });
    expect(server.listTools()).toEqual(["echo"]);
  });

  it("handles initialize request", async () => {
    const res = await server.handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.id).toBe(1);
    expect(res.result).toBeDefined();
    expect((res.result as { serverInfo: { name: string } }).serverInfo.name).toBe("test-server");
  });

  it("handles tools/list request", async () => {
    server.registerTool({
      name: "ping",
      description: "Ping",
      inputSchema: { type: "object" },
      handler: () => ({ content: [{ type: "text", text: "pong" }] }),
    });
    const res = await server.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (res.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("ping");
  });

  it("handles tools/call with valid tool", async () => {
    server.registerTool({
      name: "add",
      description: "Add two numbers",
      inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } },
      handler: ({ a, b }) => ({ content: [{ type: "text", text: `Result: ${Number(a) + Number(b)}` }] }),
    });
    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "add", arguments: { a: 2, b: 3 } },
    });
    const result = res.result as { content: Array<{ text: string }> };
    expect(result.content[0].text).toBe("Result: 5");
  });

  it("returns METHOD_NOT_FOUND for unknown tool", async () => {
    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "nonexistent", arguments: {} },
    });
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32601);
  });

  it("returns METHOD_NOT_FOUND for unknown method", async () => {
    const res = await server.handleRequest({ jsonrpc: "2.0", id: 5, method: "unknown" });
    expect(res.error?.code).toBe(-32601);
  });

  it("returns INVALID_REQUEST for malformed request", async () => {
    const res = await server.handleRequest({ jsonrpc: "1.0" as "2.0", id: 6, method: "ping" });
    expect(res.error?.code).toBe(-32600);
  });

  it("handles ping", async () => {
    const res = await server.handleRequest({ jsonrpc: "2.0", id: 7, method: "ping" });
    expect(res.result).toEqual({});
  });

  it("catches tool handler errors and returns isError result", async () => {
    server.registerTool({
      name: "fail",
      description: "Always fails",
      inputSchema: { type: "object" },
      handler: () => { throw new Error("boom"); },
    });
    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "fail" },
    });
    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("boom");
  });

  it("unregisters tools", () => {
    server.registerTool({ name: "x", description: "", inputSchema: { type: "object" }, handler: () => ({ content: [] }) });
    expect(server.unregisterTool("x")).toBe(true);
    expect(server.listTools()).toEqual([]);
  });
});

// ============================================================
// MCP CLIENT (with mocked HTTP transport)
// ============================================================
describe("MCPClient + MCPSession", () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  it("initializes and lists tools", async () => {
    let idCounter = 0;
    // Mock both responses in sequence
    mockFetch.mockImplementation(async () => {
      idCounter++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          if (idCounter === 1) {
            return { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "test", version: "1.0" } } };
          } else {
            return { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } };
          }
        },
      };
    });
    const client = new MCPClient({ name: "test-client", version: "1.0.0" });
    const transport = new MCPHttpTransport("https://mcp.example.com");
    const session = await client.connect(transport, "test");
    const tools = await session.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("echo");
  });

  it("throws on tool call error response", async () => {
    let callNum = 0;
    mockFetch.mockImplementation(async () => {
      callNum++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          if (callNum === 1) return { jsonrpc: "2.0", id: 1, result: {} };
          return { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Unknown tool: bad" } };
        },
      };
    });
    const client = new MCPClient();
    const transport = new MCPHttpTransport("https://mcp.example.com");
    const session = await client.connect(transport, "test");
    await expect(session.callTool("bad", {})).rejects.toThrow(/Unknown tool/);
  });

  it("manages multiple sessions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jsonrpc: "2.0", id: 1, result: {} }),
    });
    const client = new MCPClient();
    const t1 = new MCPHttpTransport("https://a.com");
    const t2 = new MCPHttpTransport("https://b.com");
    await client.connect(t1, "a");
    await client.connect(t2, "b");
    expect(client.listSessions().sort()).toEqual(["a", "b"]);
  });

  it("disconnects session", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jsonrpc: "2.0", id: 1, result: {} }),
    });
    const client = new MCPClient();
    await client.connect(new MCPHttpTransport("https://a.com"), "a");
    await client.disconnect("a");
    expect(client.listSessions()).toEqual([]);
  });
});

// ============================================================
// stdio ↔ SSE Bridge helpers
// ============================================================
describe("mcp-stdio-sse-bridge", () => {
  it("smartFilterText returns short text unchanged", () => {
    expect(smartFilterText("hello")).toBe("hello");
  });

  it("smartFilterText truncates long text", () => {
    const long = "x".repeat(60_000);
    const filtered = smartFilterText(long, 1000);
    expect(filtered.length).toBeLessThan(2000);
    expect(filtered).toContain("truncated");
  });

  it("smartFilterText collapses repeated items", () => {
    // Each line needs to be long enough that total > 2000 chars (the threshold for filtering)
    const lines = Array(100).fill("  - link: https://example.com/very/long/path/to/something/here").join("\n");
    const filtered = smartFilterText(lines, 50_000, 30, 10, 5);
    expect(filtered).toContain("omitted by bridge");
  });

  it("defaultMCPFilter filters text content in tool results", () => {
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "x".repeat(60_000) }] },
    });
    const filtered = defaultMCPFilter(frame, { maxTextChars: 1000 });
    expect(filtered).not.toBe(frame);
    const parsed = JSON.parse(filtered);
    expect(parsed.result.content[0].text.length).toBeLessThan(2000);
  });

  it("defaultMCPFilter leaves short content alone", () => {
    const frame = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "hi" }] } });
    expect(defaultMCPFilter(frame)).toBe(frame);
  });

  it("defaultMCPFilter passes through non-tool messages", () => {
    const frame = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { something: "else" } });
    expect(defaultMCPFilter(frame)).toBe(frame);
  });

  it("defaultMCPFilter handles invalid JSON gracefully", () => {
    expect(defaultMCPFilter("not json")).toBe("not json");
  });
});

// ============================================================
// MCP MARKETPLACE
// ============================================================
describe("MCPMarketplace", () => {
  it("ships with default registry of 15+ servers", () => {
    expect(DEFAULT_MCP_REGISTRY.length).toBeGreaterThanOrEqual(14);
    const names = DEFAULT_MCP_REGISTRY.map((s) => s.name);
    expect(names).toContain("exa");
    expect(names).toContain("tavily");
    expect(names).toContain("browsermcp");
    expect(names).toContain("github");
    expect(names).toContain("filesystem");
  });

  it("registry has categorized entries", () => {
    const categories = new Set(DEFAULT_MCP_REGISTRY.map((s) => s.category).filter(Boolean));
    expect(categories.size).toBeGreaterThan(3);
    expect(categories.has("search")).toBe(true);
    expect(categories.has("browser")).toBe(true);
    expect(categories.has("developer")).toBe(true);
  });

  it("searches by query", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp.json" });
    const results = m.search({ query: "search" });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const text = `${r.title} ${r.description} ${r.name}`.toLowerCase();
      expect(text).toContain("search");
    }
  });

  it("filters by transport", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp.json" });
    const stdio = m.search({ transport: "stdio" });
    expect(stdio.length).toBeGreaterThan(0);
    for (const s of stdio) expect(s.transport).toBe("stdio");
  });

  it("filters by authless / oauth", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp.json" });
    const authless = m.search({ authlessOnly: true });
    for (const s of authless) expect(s.oauth).toBeFalsy();
    const oauth = m.search({ oauthOnly: true });
    for (const s of oauth) expect(s.oauth).toBe(true);
  });

  it("installs and uninstalls servers (persists to JSON)", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp-install.json" });
    m.install("exa");
    expect(m.isInstalled("exa")).toBe(true);
    // Reload from disk
    const m2 = new MCPMarketplace({ configPath: "/tmp/test-mcp-install.json" });
    expect(m2.isInstalled("exa")).toBe(true);
    expect(m2.listInstalled().map((s) => s.name)).toContain("exa");
    m.uninstall("exa");
    expect(m.isInstalled("exa")).toBe(false);
  });

  it("builds managedMcpServers config (Claude CLI compatible)", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp-cfg.json" });
    m.install("exa");
    m.install("browsermcp");
    const config = m.buildManagedConfig();
    const names = config.map((c) => c.name);
    expect(names).toContain("exa");
    expect(names).toContain("browsermcp");
    const exa = config.find((c) => c.name === "exa");
    expect(exa?.url).toBe("https://mcp.exa.ai/mcp");
    const browser = config.find((c) => c.name === "browsermcp");
    expect(browser?.command).toBe("npx");
    // Tool policy should be set
    expect(exa?.toolPolicy).toBeDefined();
    expect(exa?.toolPolicy?.["web_search_exa"]).toBe("allow");
  });

  it("throws on install of unknown server", () => {
    const m = new MCPMarketplace({ configPath: "/tmp/test-mcp-err.json" });
    expect(() => m.install("nonexistent")).toThrow(/Unknown MCP/);
  });
});
