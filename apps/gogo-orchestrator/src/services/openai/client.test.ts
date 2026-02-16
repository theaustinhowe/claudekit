import { describe, expect, it } from "vitest";
import { MockOpenAIClient } from "./mock-client.js";

describe("MockOpenAIClient", () => {
  describe("chat", () => {
    it("should return empty response when no responses set", async () => {
      const client = new MockOpenAIClient();

      const result = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("");
      expect(result.toolCalls).toBeUndefined();
    });

    it("should return responses in sequence", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([
        { content: "First response" },
        { content: "Second response" },
      ]);

      const result1 = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });
      const result2 = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello again" }],
      });

      expect(result1.content).toBe("First response");
      expect(result2.content).toBe("Second response");
    });

    it("should return tool calls when specified", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([
        {
          content: "I'll read the file",
          toolCalls: [
            { name: "read_file", arguments: '{"path": "package.json"}' },
          ],
        },
      ]);

      const result = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Read package.json" }],
      });

      expect(result.content).toBe("I'll read the file");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe("read_file");
      expect(result.toolCalls?.[0].arguments).toBe('{"path": "package.json"}');
    });

    it("should log calls for inspection", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([{ content: "Response" }]);

      await client.chat({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
      });

      const calls = client.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].model).toBe("gpt-4o");
      expect(calls[0].messages).toHaveLength(2);
    });

    it("should reset state correctly", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([{ content: "First" }]);

      await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      client.reset();

      expect(client.getCalls()).toHaveLength(0);

      const result = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });
      expect(result.content).toBe("");
    });
  });

  describe("chatStream", () => {
    it("should stream content in chunks", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([{ content: "Hello, how can I help you today?" }]);

      const events: string[] = [];
      for await (const event of client.chatStream({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      })) {
        if (event.type === "content_delta" && event.delta) {
          events.push(event.delta);
        }
      }

      // Should have multiple chunks
      expect(events.length).toBeGreaterThan(1);
      expect(events.join("")).toBe("Hello, how can I help you today?");
    });

    it("should emit tool calls at the end", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([
        {
          content: "Reading file",
          toolCalls: [
            { name: "read_file", arguments: '{"path": "test.ts"}' },
            { name: "shell", arguments: '{"command": "npm test"}' },
          ],
        },
      ]);

      const toolCalls: Array<{ name: string; arguments: string }> = [];
      for await (const event of client.chatStream({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Run tests" }],
      })) {
        if (event.type === "tool_call" && event.toolCall) {
          toolCalls.push({
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          });
        }
      }

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe("read_file");
      expect(toolCalls[1].name).toBe("shell");
    });

    it("should emit done event at the end", async () => {
      const client = new MockOpenAIClient();
      client.setResponses([{ content: "Done" }]);

      const events: string[] = [];
      for await (const event of client.chatStream({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      })) {
        events.push(event.type);
      }

      expect(events[events.length - 1]).toBe("done");
    });
  });

  describe("addResponse", () => {
    it("should add responses incrementally", async () => {
      const client = new MockOpenAIClient();
      client.addResponse({ content: "First" });
      client.addResponse({ content: "Second" });

      const result1 = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "1" }],
      });
      const result2 = await client.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "2" }],
      });

      expect(result1.content).toBe("First");
      expect(result2.content).toBe("Second");
    });
  });
});
