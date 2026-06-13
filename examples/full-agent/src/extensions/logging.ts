import type { Extension } from "./runner.js";

export function createLoggingExtension(): Extension {
  return {
    name: "logging",
    description: "Logs all agent events",
    activate(ctx) {
      ctx.on("before_agent_start", () => {
        console.log("[LOG] Agent started");
      });
      ctx.on("after_agent_end", () => {
        console.log("[LOG] Agent ended");
      });
    },
  };
}
