import type { Extension } from "./runner.js";

export function createSecurityExtension(): Extension {
  return {
    name: "security",
    description: "Blocks dangerous operations",
    activate(ctx) {
      ctx.on("before_tool_call", (event: any) => {
        if (event.toolName === "bash") {
          const command = event.args?.command as string;
          const blocked = ["rm -rf", "mkfs", "dd if="];
          for (const pattern of blocked) {
            if (command?.includes(pattern)) {
              throw new Error(\`Blocked dangerous command: \${pattern}\`);
            }
          }
        }
      });
    },
  };
}
