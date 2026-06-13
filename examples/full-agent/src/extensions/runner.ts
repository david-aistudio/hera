/**
 * Extension Runner — Manages extension lifecycle
 */

export interface Extension {
  name: string;
  description: string;
  activate: (ctx: ExtensionContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export interface ExtensionContext {
  on: (type: string, handler: (event: any) => void) => () => void;
  emit: (type: string, data: unknown) => Promise<void>;
}

export class ExtensionRunner {
  private extensions: Extension[] = [];
  private handlers: Map<string, Set<(event: any) => void>> = new Map();

  async load(extensions: Extension[]): Promise<void> {
    this.extensions = extensions;

    const ctx: ExtensionContext = {
      on: (type, handler) => {
        if (!this.handlers.has(type)) {
          this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler);
        return () => this.handlers.get(type)?.delete(handler);
      },
      emit: async (type, data) => this.emit(type, data),
    };

    for (const ext of extensions) {
      await ext.activate(ctx);
    }
  }

  async emit(type: string, data: unknown): Promise<void> {
    const handlers = this.handlers.get(type);
    if (!handlers) return;
    for (const handler of handlers) {
      await handler(data);
    }
  }
}

export function createExtensionRunner(): ExtensionRunner {
  return new ExtensionRunner();
}
