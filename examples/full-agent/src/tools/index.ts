import type { Tool } from "../agent/types.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createBashTool } from "./bash.js";

export function createTools(cwd: string): Tool[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createBashTool(cwd),
  ];
}

export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";
export { createBashTool } from "./bash.js";
