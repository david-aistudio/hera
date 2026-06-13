export { createOpenAIProvider } from "./openai.js";
export { createRealOpenAIProvider } from "./openai-real.js";

export function createProvider() {
  return createOpenAIProvider();
}
