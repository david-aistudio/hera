/**
 * Minimal Session — Hera Architecture Reference
 *
 * Tree-based session storage. Pi uses this pattern for conversation history.
 * Based on packages/agent/src/harness/session/
 *
 * Key insight: Sessions are TREES, not linear logs.
 * This enables branching (fork from any point) and compaction.
 */

// ============================================================================
// Types
// ============================================================================

interface SessionEntry {
  id: string;
  parentId: string | null;
  type: "message" | "compaction" | "branch_summary" | "label" | "leaf";
  timestamp: string;
  data: unknown;
}

interface SessionMetadata {
  id: string;
  createdAt: string;
  name?: string;
}

interface SessionContext {
  messages: unknown[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

// ============================================================================
// In-Memory Session Storage
// ============================================================================

class InMemorySessionStorage {
  private entries: SessionEntry[] = [];
  private byId: Map<string, SessionEntry> = new Map();
  private leafId: string | null = null;
  private metadata: SessionMetadata;

  constructor(metadata?: Partial<SessionMetadata>) {
    this.metadata = {
      id: metadata?.id ?? crypto.randomUUID(),
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      ...metadata,
    };
  }

  // --- Core Operations ---

  getMetadata(): SessionMetadata {
    return this.metadata;
  }

  getLeafId(): string | null {
    return this.leafId;
  }

  getEntry(id: string): SessionEntry | undefined {
    return this.byId.get(id);
  }

  getEntries(): SessionEntry[] {
    return [...this.entries];
  }

  // --- Append Entry ---

  appendEntry(entry: Omit<SessionEntry, "id" | "parentId" | "timestamp">): string {
    const id = this.generateId();
    const fullEntry: SessionEntry = {
      ...entry,
      id,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(fullEntry);
    this.byId.set(id, fullEntry);

    // Update leaf (unless it's a leaf pointer entry)
    if (entry.type !== "leaf") {
      this.leafId = id;
    }

    return id;
  }

  // --- Tree Navigation ---

  getPathToRoot(leafId: string | null): SessionEntry[] {
    if (!leafId) return [];

    const path: SessionEntry[] = [];
    let current = this.byId.get(leafId);

    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      current = this.byId.get(current.parentId);
    }

    return path;
  }

  getBranch(): SessionEntry[] {
    return this.getPathToRoot(this.leafId);
  }

  // --- Branching ---

  fork(label?: string): string {
    // Create leaf pointer to current position
    const leafId = this.appendEntry({
      type: "leaf",
      data: { targetId: this.leafId },
    });

    // Add label if provided
    if (label) {
      this.appendEntry({
        type: "label",
        data: { targetId: this.leafId, label },
      });
    }

    return leafId;
  }

  switchToBranch(entryId: string): void {
    if (!this.byId.has(entryId)) {
      throw new Error(`Entry ${entryId} not found`);
    }
    this.leafId = entryId;
  }

  // --- Compaction ---

  compact(summary: string, firstKeptEntryId: string): string {
    return this.appendEntry({
      type: "compaction",
      data: {
        summary,
        firstKeptEntryId,
        tokensBefore: this.estimateTokens(),
      },
    });
  }

  // --- Context Building ---

  buildContext(): SessionContext {
    const branch = this.getBranch();
    const messages: unknown[] = [];
    let compactionIndex = -1;

    // Find compaction entry
    for (let i = 0; i < branch.length; i++) {
      if (branch[i].type === "compaction") {
        compactionIndex = i;
        break;
      }
    }

    if (compactionIndex >= 0) {
      // Add compaction summary
      const compaction = branch[compactionIndex];
      messages.push({
        role: "user",
        content: `Summary: ${(compaction.data as any).summary}`,
      });

      // Add only messages after compaction
      for (let i = compactionIndex + 1; i < branch.length; i++) {
        if (branch[i].type === "message") {
          messages.push((branch[i].data as any).message);
        }
      }
    } else {
      // No compaction — add all messages
      for (const entry of branch) {
        if (entry.type === "message") {
          messages.push((entry.data as any).message);
        }
      }
    }

    return {
      messages,
      thinkingLevel: "off",
      model: null,
    };
  }

  // --- Helpers ---

  private generateId(): string {
    return crypto.randomUUID().slice(0, 8);
  }

  private estimateTokens(): number {
    // Rough estimate: 4 chars per token
    const totalChars = this.entries.reduce((sum, e) => {
      return sum + JSON.stringify(e.data).length;
    }, 0);
    return Math.ceil(totalChars / 4);
  }
}

// ============================================================================
// Session Wrapper (higher-level API)
// ============================================================================

class Session {
  private storage: InMemorySessionStorage;

  constructor(storage?: InMemorySessionStorage) {
    this.storage = storage ?? new InMemorySessionStorage();
  }

  getMetadata(): SessionMetadata {
    return this.storage.getMetadata();
  }

  // --- Message Operations ---

  appendMessage(message: unknown): string {
    return this.storage.appendEntry({
      type: "message",
      data: { message },
    });
  }

  appendCompaction(summary: string, firstKeptEntryId: string): string {
    return this.storage.compact(summary, firstKeptEntryId);
  }

  appendBranchSummary(summary: string, fromId: string): string {
    return this.storage.appendEntry({
      type: "branch_summary",
      data: { summary, fromId },
    });
  }

  // --- Context ---

  buildContext(): SessionContext {
    return this.storage.buildContext();
  }

  getBranch(): SessionEntry[] {
    return this.storage.getBranch();
  }

  // --- Branching ---

  fork(label?: string): string {
    return this.storage.fork(label);
  }

  switchToBranch(entryId: string): void {
    this.storage.switchToBranch(entryId);
  }
}

// ============================================================================
// Example Usage
// ============================================================================

function main() {
  const session = new Session();

  // Add messages
  session.appendMessage({ role: "user", content: "Hello" });
  session.appendMessage({ role: "assistant", content: "Hi! How can I help?" });
  session.appendMessage({ role: "user", content: "Read README.md" });
  session.appendMessage({ role: "assistant", content: "I'll read it for you." });

  // Fork to explore alternative
  const branchId = session.fork("try different approach");

  // Continue on main branch
  session.appendMessage({ role: "user", content: "What's in it?" });

  // Build context
  const context = session.buildContext();
  console.log("Messages in context:", context.messages.length);

  // Switch to branch
  session.switchToBranch(branchId);
  const branchContext = session.buildContext();
  console.log("Messages in branch:", branchContext.messages.length);
}

main();
