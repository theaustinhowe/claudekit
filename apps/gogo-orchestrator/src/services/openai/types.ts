/**
 * TypeScript interfaces for OpenAI client abstraction
 */

export interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAIToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAITool {
  type: "function";
  function: OpenAIToolFunction;
}

export interface OpenAIToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface OpenAIChatResponse {
  content: string;
  toolCalls?: OpenAIToolCall[];
}

export interface OpenAIStreamEvent {
  type: "content_delta" | "tool_call" | "done" | "error";
  delta?: string;
  toolCall?: OpenAIToolCall;
  error?: string;
}

export interface OpenAIChatParams {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
}

/**
 * Interface for OpenAI client implementations
 * Allows for real and mock implementations
 */
export interface OpenAIClientInterface {
  /**
   * Send a chat completion request
   */
  chat(params: OpenAIChatParams): Promise<OpenAIChatResponse>;

  /**
   * Send a streaming chat completion request
   * Yields events as they arrive
   */
  chatStream(
    params: Omit<OpenAIChatParams, "stream">,
  ): AsyncIterable<OpenAIStreamEvent>;
}
