import * as fs from "fs";
import * as path from "path";
import type { Tool } from "../agent/types.js";

export function createWriteTool(cwd: string): Tool {
  return {
    name: "write",
    description: "Write content to a file",
    execute: async (args) => {
      const filePath = path.resolve(cwd, args.path as string);
      const dir = path.dirname(filePath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, args.content as string);
      return "Written to " + args.path;
    },
  };
}
