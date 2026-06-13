# Security Patterns — Hera Architecture Reference

This document covers security patterns for building production-grade AI coding agents. An agent without proper guardrails can be dangerous — it can execute arbitrary commands, read sensitive files, and exfiltrate data.

---

## 1. Tool Sandboxing

### 1.1 Bash Command Restrictions

The `bash` tool is the most dangerous. Restrict it:

```typescript
// Whitelist approach (recommended for production)
const ALLOWED_COMMANDS = [
  "ls", "cat", "grep", "find", "head", "tail",
  "git", "npm", "node", "python", "pip",
];

// Blacklist approach (less secure, but more flexible)
const BLOCKED_PATTERNS = [
  /rm\s+-rf/,           // Recursive delete
  /mkfs/,               // Format filesystem
  /dd\s+if=/,           // Disk dump
  /curl.*\|.*sh/,       // Pipe to shell
  /wget.*\|.*bash/,     // Pipe to bash
  /chmod\s+777/,        // Open permissions
  />\s*\/etc\//,        // Write to /etc
];

function isCommandSafe(command: string): boolean {
  // Check whitelist
  const baseCommand = command.trim().split(/\s+/)[0];
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    return false;
  }

  // Check blacklist
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return false;
    }
  }

  return true;
}
```

### 1.2 File Access Restrictions

Restrict which files the agent can read/write:

```typescript
const BLOCKED_PATHS = [
  "/etc/passwd",
  "/etc/shadow",
  "~/.ssh",
  "~/.aws",
  "~/.env",
  ".env",
  "*.pem",
  "*.key",
];

function isPathSafe(path: string, operation: "read" | "write"): boolean {
  // Resolve to absolute path
  const resolved = resolve(path);

  // Check against blocked paths
  for (const blocked of BLOCKED_PATHS) {
    if (resolved.startsWith(blocked) || minimatch(path, blocked)) {
      return false;
    }
  }

  // Write operations: restrict to cwd
  if (operation === "write") {
    if (!resolved.startsWith(process.cwd())) {
      return false;
    }
  }

  return true;
}
```

### 1.3 Rate Limiting

Prevent abuse with rate limits:

```typescript
class RateLimiter {
  private counts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private maxCalls: number = 100,
    private windowMs: number = 60000, // 1 minute
  ) {}

  check(toolName: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(toolName);

    if (!entry || now > entry.resetAt) {
      this.counts.set(toolName, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxCalls) {
      return false;
    }

    entry.count++;
    return true;
  }
}
```

---

## 2. Permission System

### 2.1 Tool Permissions

Define permission levels for tools:

```typescript
type PermissionLevel = "auto" | "confirm" | "block";

interface ToolPermissions {
  [toolName: string]: PermissionLevel;
}

const DEFAULT_PERMISSIONS: ToolPermissions = {
  read: "auto",           // Safe — read only
  write: "confirm",       // Destructive — ask user
  edit: "confirm",        // Destructive — ask user
  bash: "confirm",        // Dangerous — ask user
  grep: "auto",           // Safe — read only
  find: "auto",           // Safe — read only
  ls: "auto",             // Safe — read only
};

function checkPermission(
  toolName: string,
  permissions: ToolPermissions,
): PermissionLevel {
  return permissions[toolName] ?? "block"; // Default: block unknown tools
}
```

### 2.2 User Confirmation

Ask user before dangerous operations:

```typescript
async function confirmToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ui: UIContext,
): Promise<boolean> {
  const description = describeToolCall(toolName, args);

  return ui.confirm(
    "Tool Execution",
    `Allow ${toolName}?\n\n${description}`,
  );
}

function describeToolCall(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "write":
      return `Write to file: ${args.path}`;
    case "edit":
      return `Edit file: ${args.path}`;
    case "bash":
      return `Execute: ${args.command}`;
    default:
      return `${toolName}(${JSON.stringify(args)})`;
  }
}
```

---

## 3. Input Validation

### 3.1 Sanitize User Input

Never trust user input:

```typescript
function sanitizeInput(input: string): string {
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Limit length
  const MAX_INPUT_LENGTH = 100000;
  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }

  return sanitized;
}
```

### 3.2 Validate Tool Parameters

Use schemas (TypeBox in Pi):

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { Compile } from "@sinclair/typebox/compiler";

const ReadFileSchema = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 1000 }),
  offset: Type.Optional(Type.Number({ minimum: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10000 })),
});

const ReadFileValidator = Compile(ReadFileSchema);

function validateToolArgs(toolName: string, args: unknown): boolean {
  switch (toolName) {
    case "read":
      return ReadFileValidator.Check(args);
    default:
      return true;
  }
}
```

---

## 4. Output Sanitization

### 4.1 Strip Sensitive Data

Remove sensitive information from tool output:

```typescript
const SENSITIVE_PATTERNS = [
  /api[_-]?key[\s]*[:=]\s*["']?[\w-]+["']?/gi,
  /secret[\s]*[:=]\s*["']?[\w-]+["']?/gi,
  /password[\s]*[:=]\s*["']?[\w-]+["']?/gi,
  /token[\s]*[:=]\s*["']?[\w-]+["']?/gi,
  /Bearer\s+[\w-]+/gi,
  /sk-[\w]+/gi,                    // OpenAI API keys
  /ghp_[\w]+/gi,                   // GitHub tokens
];

function sanitizeOutput(output: string): string {
  let sanitized = output;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}
```

### 4.2 Limit Output Size

Prevent context overflow:

```typescript
const MAX_TOOL_OUTPUT = 100000; // 100KB

function truncateOutput(output: string, maxChars: number = MAX_TOOL_OUTPUT): string {
  if (output.length <= maxChars) return output;

  return (
    output.slice(0, maxChars) +
    `\n\n[Output truncated. Full output: ${output.length} chars]`
  );
}
```

---

## 5. API Key Security

### 5.1 Never Log API Keys

```typescript
function sanitizeForLogging(message: string): string {
  // Remove API keys from logs
  return message
    .replace(/sk-[\w]+/g, "[OPENAI_KEY]")
    .replace(/Bearer\s+[\w-]+/g, "Bearer [REDACTED]");
}
```

### 5.2 Use Environment Variables

```typescript
// Good
const apiKey = process.env.OPENAI_API_KEY;

// Bad
const apiKey = "sk-1234567890abcdef";
```

### 5.3 Key Rotation

Support key rotation without restart:

```typescript
class ApiKeyManager {
  private keys: Map<string, string> = new Map();

  setKey(provider: string, key: string): void {
    this.keys.set(provider, key);
  }

  getKey(provider: string): string | undefined {
    return this.keys.get(provider);
  }

  // Rotate key
  rotateKey(provider: string, newKey: string): void {
    this.keys.set(provider, newKey);
  }
}
```

---

## 6. Audit Logging

Log all tool calls for accountability:

```typescript
interface AuditEntry {
  timestamp: string;
  toolName: string;
  args: Record<string, unknown>;
  result: "success" | "error" | "blocked";
  duration: number;
  userId?: string;
}

class AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: AuditEntry): void {
    this.entries.push(entry);
    // In production: write to file, database, or monitoring service
    console.log(`[AUDIT] ${entry.timestamp} ${entry.toolName} ${entry.result}`);
  }

  getEntries(): AuditEntry[] {
    return [...this.entries];
  }
}
```

---

## Checklist

- [ ] Bash commands restricted (whitelist or blacklist)
- [ ] File access restricted (cwd-based for writes)
- [ ] Rate limiting implemented
- [ ] Permission levels defined for each tool
- [ ] User confirmation for destructive operations
- [ ] User input sanitized
- [ ] Tool parameters validated (TypeBox schemas)
- [ ] Output sanitized (strip sensitive data)
- [ ] Output size limited
- [ ] API keys never logged
- [ ] API keys stored in environment variables
- [ ] Audit logging implemented
