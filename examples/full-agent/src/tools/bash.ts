import { execSync } from "child_process";
import type { Tool } from "../agent/types.js";

export function createBashTool(cwd: string): Tool {
  return {
    name: "bash",
    description: "Execute a shell command",
    execute: async (args) => {
      const command = args.command as string;
      const timeout = (args.timeout as number) || 30000;
      
      try {
        const output = execSync(command, {
          cwd,
          timeout,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return output || "(no output)";
      } catch (error: any) {
        const stdout = error.stdout || "";
        const stderr = error.stderr || "";
        return stdout + stderr + "\nExit code: " + error.status;
      }
    },
  };
}
