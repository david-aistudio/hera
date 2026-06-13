/**
 * In-Memory Session Storage — Tree-based
 */

export interface SessionEntry {
  id: string;
  parentId: string | null;
  type: "message" | "compaction" | "leaf";
  timestamp: string;
  data: unknown;
}

export class InMemorySessionStorage {
  private entries: SessionEntry[] = [];
  private byId: Map<string, SessionEntry> = new Map();
  private leafId: string | null = null;

  appendEntry(entry: Omit<SessionEntry, "id" | "parentId" | "timestamp">): string {
    const id = crypto.randomUUID().slice(0, 8);
    const fullEntry: SessionEntry = {
      ...entry,
      id,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(fullEntry);
    this.byId.set(id, fullEntry);
    if (entry.type !== "leaf") this.leafId = id;
    return id;
  }

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
}
