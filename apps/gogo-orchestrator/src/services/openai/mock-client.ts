/**
 * Mock OpenAI client for testing
 * Allows tests to define expected responses without calling the real API
 */

import type { OpenAIChatParams, OpenAIChatResponse, OpenAIClientInterface, OpenAIStreamEvent } from "./types.js";

interface MockResponse {
  content: string;
  toolCalls?: Array<{ name: string; arguments: string }>;
}

/**
 * Mock OpenAI client for testing
 */
export class MockOpenAIClient implements OpenAIClientInterface {
  private responses: MockResponse[] = [];
  private responseIndex = 0;
  private callLog: OpenAIChatParams[] = [];

  /**
   * Set the responses the mock will return
   * Each call to chat() will return the next response in sequence
   */
  setResponses(responses: MockResponse[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }

  /**
   * Add a single response to the queue
   */
  addResponse(response: MockResponse): void {
    this.responses.push(response);
  }

  /**
   * Get the call log for assertions
   */
  getCalls(): OpenAIChatParams[] {
    return this.callLog;
  }

  /**
   * Reset the mock state
   */
  reset(): void {
    this.responses = [];
    this.responseIndex = 0;
    this.callLog = [];
  }

  async chat(params: OpenAIChatParams): Promise<OpenAIChatResponse> {
    this.callLog.push(params);

    if (this.responseIndex >= this.responses.length) {
      return { content: "" };
    }

    const mockResponse = this.responses[this.responseIndex++];

    return {
      content: mockResponse.content,
      toolCalls: mockResponse.toolCalls?.map((tc, i) => ({
        id: `call_${i}`,
        name: tc.name,
        arguments: tc.arguments,
      })),
    };
  }

  async *chatStream(params: Omit<OpenAIChatParams, "stream">): AsyncIterable<OpenAIStreamEvent> {
    this.callLog.push({ ...params, stream: true });

    if (this.responseIndex >= this.responses.length) {
      yield { type: "done" };
      return;
    }

    const mockResponse = this.responses[this.responseIndex++];

    // Emit content in chunks to simulate streaming
    const content = mockResponse.content;
    const chunkSize = 20;
    for (let i = 0; i < content.length; i += chunkSize) {
      yield {
        type: "content_delta",
        delta: content.slice(i, i + chunkSize),
      };
    }

    // Emit tool calls
    if (mockResponse.toolCalls) {
      for (let i = 0; i < mockResponse.toolCalls.length; i++) {
        const tc = mockResponse.toolCalls[i];
        yield {
          type: "tool_call",
          toolCall: {
            id: `call_${i}`,
            name: tc.name,
            arguments: tc.arguments,
          },
        };
      }
    }

    yield { type: "done" };
  }
}
