import { describe, expect, it } from "vitest";
import { parseStreamJsonEvent } from "./parser";
import type { ClaudeStreamEvent } from "./types";

const cwd = "/home/user/project";

describe("parseStreamJsonEvent", () => {
  describe("system events", () => {
    it("returns 'Connected' status for system type", () => {
      const evt: ClaudeStreamEvent = { type: "system" };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ log: "Connected", logType: "status" });
    });
  });

  describe("result events", () => {
    it("returns formatted duration when duration_ms is present", () => {
      const evt: ClaudeStreamEvent = { type: "result", duration_ms: 12345 };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ log: "Done in 12.3s", logType: "status" });
    });

    it("returns formatted duration when duration_api_ms is present", () => {
      const evt: ClaudeStreamEvent = { type: "result", duration_api_ms: 5678 };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ log: "Done in 5.7s", logType: "status" });
    });

    it("prefers duration_ms over duration_api_ms", () => {
      const evt: ClaudeStreamEvent = {
        type: "result",
        duration_ms: 3000,
        duration_api_ms: 9000,
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ log: "Done in 3.0s", logType: "status" });
    });

    it("returns 'Done' without duration when neither field is present", () => {
      const evt: ClaudeStreamEvent = { type: "result" };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ log: "Done", logType: "status" });
    });
  });

  describe("assistant text events (no tool_use)", () => {
    it("concatenates text blocks into a chunk", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ chunk: "Hello world" });
    });

    it("returns only text blocks, ignoring non-text blocks", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "some output" },
            { type: "other", data: "ignored" },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({ chunk: "some output" });
    });

    it("returns empty object when assistant has no text blocks", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [{ type: "image", data: "..." }],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({});
    });
  });

  describe("tool_use events", () => {
    it("extracts Read tool with file_path shortened relative to cwd", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/home/user/project/src/index.ts" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Read  src/index.ts");
      expect(result.logType).toBe("tool");
    });

    it("extracts Write tool with file_path and content chunk", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Write",
              input: {
                file_path: "/home/user/project/out.txt",
                content: "file content here",
              },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Write  out.txt");
      expect(result.logType).toBe("tool");
      expect(result.chunk).toBe("file content here");
    });

    it("extracts Glob tool with pattern and shortened path", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Glob",
              input: { pattern: "**/*.ts", path: "/home/user/project/src" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Glob  **/*.ts  src");
      expect(result.logType).toBe("tool");
    });

    it("extracts Grep tool with pattern and shortened path", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Grep",
              input: { pattern: "TODO", path: "/home/user/project/lib" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Grep  TODO  lib");
      expect(result.logType).toBe("tool");
    });

    it("extracts Bash tool with command", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "npm test" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Bash  npm test");
      expect(result.logType).toBe("tool");
    });

    it("extracts Edit tool with file_path", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Edit",
              input: { file_path: "/home/user/project/src/app.ts" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Edit  src/app.ts");
      expect(result.logType).toBe("tool");
    });

    it("extracts LS tool with path", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "LS",
              input: { path: "/home/user/project/src" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("LS  src");
      expect(result.logType).toBe("tool");
    });

    it("shows just the tool name when no recognizable input", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: {},
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Bash");
      expect(result.logType).toBe("tool");
    });

    it("skips unknown tool names", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "UnknownTool",
              input: { file_path: "/some/file" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      // Unknown tool is skipped, so no tool lines; also no text => empty result
      expect(result).toEqual({});
    });

    it("does not shorten paths outside of cwd", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/other/location/file.ts" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Read  /other/location/file.ts");
    });

    it("combines thinking text and tool lines", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Let me read the file first" },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/home/user/project/pkg.json" },
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.logType).toBe("tool");
      // thinking lines are tab-indented, tool lines are not
      expect(result.log).toContain("\tLet me read the file first");
      expect(result.log).toContain("Read  pkg.json");
    });

    it("truncates long thinking text to 80 chars with ellipsis", () => {
      const longText = "A".repeat(100);
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: longText },
            { type: "tool_use", name: "Bash", input: { command: "ls" } },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      const thinkingLine = result.log!.split("\n")[0];
      // Tab + 80 chars + "..."
      expect(thinkingLine).toBe(`\t${"A".repeat(80)}...`);
    });

    it("handles stringified JSON input for tool_use", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: JSON.stringify({ file_path: "/home/user/project/data.json" }),
            },
          ],
        },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result.log).toBe("Read  data.json");
    });
  });

  describe("events with no message content", () => {
    it("returns empty object for event without message", () => {
      const evt: ClaudeStreamEvent = { type: "assistant" };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({});
    });

    it("returns empty object for event with empty content array", () => {
      const evt: ClaudeStreamEvent = {
        type: "assistant",
        message: { content: [] },
      };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({});
    });
  });

  describe("unknown events", () => {
    it("returns empty object for unknown event types without message", () => {
      const evt: ClaudeStreamEvent = { type: "ping" };
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({});
    });

    it("returns empty object for unknown event type with non-matching content", () => {
      const evt: ClaudeStreamEvent = {
        type: "unknown_type",
        message: {
          content: [{ type: "text", text: "Hello" }],
        },
      };
      // Not "assistant" type, so the text extraction branch is not reached
      // And no tool_use blocks, so toolUse branch is skipped
      const result = parseStreamJsonEvent(evt, cwd);
      expect(result).toEqual({});
    });
  });
});
