/**
 * Real OpenAI client implementation using the openai npm package
 */

import OpenAI from "openai";
import type {
  OpenAIChatParams,
  OpenAIChatResponse,
  OpenAIClientInterface,
  OpenAIStreamEvent,
  OpenAIToolCall,
} from "./types.js";

export class OpenAIClient implements OpenAIClientInterface {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async chat(params: OpenAIChatParams): Promise<OpenAIChatResponse> {
    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      tools: params.tools?.map((t) => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      })),
    });

    const choice = response.choices[0];
    const content = choice.message.content ?? "";
    const toolCalls: OpenAIToolCall[] | undefined =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

    return { content, toolCalls };
  }

  async *chatStream(
    params: Omit<OpenAIChatParams, "stream">,
  ): AsyncIterable<OpenAIStreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      tools: params.tools?.map((t) => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      })),
      stream: true,
    });

    // Track partial tool calls by index
    const toolCallsInProgress = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle content deltas
        if (delta.content) {
          yield {
            type: "content_delta",
            delta: delta.content,
          };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;

            // Initialize or update the tool call
            if (!toolCallsInProgress.has(index)) {
              toolCallsInProgress.set(index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              });
            } else {
              const existing = toolCallsInProgress.get(index);
              if (existing) {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments)
                  existing.arguments += tc.function.arguments;
              }
            }
          }
        }
      }

      // Emit completed tool calls
      for (const toolCall of toolCallsInProgress.values()) {
        yield {
          type: "tool_call",
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        };
      }

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
