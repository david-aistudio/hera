import * as fs from "fs";
import * as path from "path";
import type { Tool } from "../agent/types.js";

export function createReadTool(cwd: string): Tool {
  return {
    name: "read",
    description: "Read the contents of a file",
    execute: async (args) => {
      const filePath = path.resolve(cwd, args.path as string);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${args.path}`);
      }
      
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const offset = (args.offset as number) || 1;
      const limit = (args.limit as number) || 500;
      
      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      return sliced.map((line, i) => \`\${offset + i}|\${line}\`).join("\n");
    },
  };
}
