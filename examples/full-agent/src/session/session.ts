/**
 * Session — High-level session API
 */

import type { AgentMessage } from "../agent/types.js";
import { InMemorySessionStorage } from "./storage.js";

export class Session {
  private storage: InMemorySessionStorage;
  private messages: AgentMessage[] = [];

  constructor() {
    this.storage = new InMemorySessionStorage();
  }

  appendMessage(message: AgentMessage): void {
    this.messages.push(message);
    this.storage.appendEntry({
      type: "message",
      data: { message },
    });
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}

export function createSession(): Session {
  return new Session();
}
