/**
 * OpenAI client factory with dependency injection support
 */

export { OpenAIClient } from "./client.js";
export { MockOpenAIClient } from "./mock-client.js";
export type {
  OpenAIChatParams,
  OpenAIChatResponse,
  OpenAIClientInterface,
  OpenAIMessage,
  OpenAIStreamEvent,
  OpenAITool,
  OpenAIToolCall,
} from "./types.js";

import { OpenAIClient } from "./client.js";
import type { OpenAIClientInterface } from "./types.js";

let clientInstance: OpenAIClientInterface | null = null;

/**
 * Set a custom OpenAI client instance
 * Useful for testing with MockOpenAIClient
 */
export function setOpenAIClient(client: OpenAIClientInterface): void {
  clientInstance = client;
}

/**
 * Get the OpenAI client instance
 * Creates a real client if none has been set
 */
export function getOpenAIClient(): OpenAIClientInterface {
  if (!clientInstance) {
    clientInstance = new OpenAIClient();
  }
  return clientInstance;
}

/**
 * Reset the OpenAI client instance
 * Useful for test cleanup
 */
export function resetOpenAIClient(): void {
  clientInstance = null;
}
