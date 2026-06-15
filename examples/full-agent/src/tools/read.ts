import * as fs from "fs";
import * as path from "path";
import type { Tool } from "../agent/types.js";

/**
 * Create a read tool sandboxed to the given working directory.
 *
 * Security: All paths are resolved relative to `cwd`. Absolute paths
 * and paths containing `..` that escape the sandbox are rejected.
 * Symlinks are resolved and checked against the sandbox boundary.
 */
export function createReadTool(cwd: string): Tool {
  // Normalize the sandbox root once
  const sandboxRoot = path.resolve(cwd);

  function isWithinSandbox(target: string): boolean {
    // Resolve symlinks and normalize
    const resolved = path.resolve(sandboxRoot, target);
    // Ensure the resolved path starts with the sandbox root
    // Use path.relative to handle edge cases (trailing slashes, etc.)
    const relative = path.relative(sandboxRoot, resolved);
    // If the relative path starts with "..", it escapes the sandbox
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  return {
    name: "read",
    description: "Read the contents of a file within the working directory",
    execute: async (args) => {
      const rawPath = args.path as string;

      // Reject absolute paths — only relative paths within cwd are allowed
      if (path.isAbsolute(rawPath)) {
        throw new Error(
          `Access denied: absolute paths are not allowed. Use a relative path within the project directory.`
        );
      }

      // Resolve the path within the sandbox
      const filePath = path.resolve(sandboxRoot, rawPath);

      // Verify the resolved path is within the sandbox
      if (!isWithinSandbox(rawPath)) {
        throw new Error(
          `Access denied: path "${rawPath}" escapes the project directory. Only files within the project can be read.`
        );
      }

      // Check for symlink escape (resolve the real path)
      if (fs.existsSync(filePath)) {
        const realPath = fs.realpathSync(filePath);
        const realRelative = path.relative(sandboxRoot, realPath);
        if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
          throw new Error(
            `Access denied: symlink target escapes the project directory.`
          );
        }
      }

      if (!fs.existsSync(filePath)) {
        throw new Error("File not found: " + rawPath);
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const offset = (args.offset as number) || 1;
      const limit = (args.limit as number) || 500;

      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      return sliced.map((line, i) => (offset + i) + "|" + line).join("\n");
    },
  };
}
