import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeTool, getAllTools } from "./tools.js";

describe("OpenAI Tools", () => {
  describe("getAllTools", () => {
    it("should return all tool definitions", () => {
      const tools = getAllTools();

      expect(tools).toHaveLength(6);

      const toolNames = tools.map((t) => t.function.name);
      expect(toolNames).toContain("shell");
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
      expect(toolNames).toContain("list_directory");
      expect(toolNames).toContain("signal_ready_to_pr");
      expect(toolNames).toContain("signal_needs_info");
    });

    it("should have correct structure for each tool", () => {
      const tools = getAllTools();

      for (const tool of tools) {
        expect(tool.type).toBe("function");
        expect(tool.function.name).toBeTruthy();
        expect(tool.function.description).toBeTruthy();
        expect(tool.function.parameters).toBeDefined();
      }
    });
  });

  describe("executeTool", () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a temporary test directory
      testDir = path.join("/tmp", `openai-tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("shell tool", () => {
      it("should execute shell commands", async () => {
        const result = await executeTool("shell", { command: "echo hello" }, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toContain("hello");
        expect(result.signal).toBeUndefined();
      });

      it("should capture stderr on failed commands", async () => {
        const result = await executeTool(
          "shell",
          { command: "ls /nonexistent-path-12345" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result.toLowerCase()).toMatch(/no such file|not found|cannot access/);
      });

      it("should run commands in the specified directory", async () => {
        const result = await executeTool("shell", { command: "pwd" }, { cwd: testDir, jobId: "test-job" });

        // On macOS, /tmp is a symlink to /private/tmp
        expect(result.result.trim()).toMatch(new RegExp(`(${testDir}|/private${testDir})$`));
      });
    });

    describe("read_file tool", () => {
      it("should read file contents", async () => {
        const testFile = path.join(testDir, "test.txt");
        await fs.writeFile(testFile, "test content");

        const result = await executeTool("read_file", { path: "test.txt" }, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toBe("test content");
      });

      it("should return error for non-existent file", async () => {
        const result = await executeTool("read_file", { path: "nonexistent.txt" }, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toContain("Error: File not found");
      });

      it("should prevent path traversal", async () => {
        const result = await executeTool(
          "read_file",
          { path: "../../../etc/passwd" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toContain("Cannot read files outside");
      });
    });

    describe("write_file tool", () => {
      it("should write file contents", async () => {
        const result = await executeTool(
          "write_file",
          { path: "output.txt", content: "new content" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toContain("Successfully wrote");

        const content = await fs.readFile(path.join(testDir, "output.txt"), "utf-8");
        expect(content).toBe("new content");
      });

      it("should create nested directories", async () => {
        const result = await executeTool(
          "write_file",
          { path: "nested/dir/file.txt", content: "deep content" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toContain("Successfully wrote");

        const content = await fs.readFile(path.join(testDir, "nested/dir/file.txt"), "utf-8");
        expect(content).toBe("deep content");
      });

      it("should prevent path traversal", async () => {
        const result = await executeTool(
          "write_file",
          { path: "../../../tmp/evil.txt", content: "bad" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toContain("Cannot write files outside");
      });
    });

    describe("list_directory tool", () => {
      it("should list directory contents", async () => {
        await fs.writeFile(path.join(testDir, "file1.txt"), "");
        await fs.writeFile(path.join(testDir, "file2.txt"), "");
        await fs.mkdir(path.join(testDir, "subdir"));

        const result = await executeTool("list_directory", { path: "." }, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toContain("file1.txt");
        expect(result.result).toContain("file2.txt");
        expect(result.result).toContain("subdir/");
      });

      it("should return error for non-existent directory", async () => {
        const result = await executeTool(
          "list_directory",
          { path: "nonexistent" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toContain("Error: Directory not found");
      });

      it("should prevent path traversal", async () => {
        const result = await executeTool("list_directory", { path: "../../../" }, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toContain("Cannot list directories outside");
      });
    });

    describe("signal_ready_to_pr tool", () => {
      it("should return ready_to_pr signal", async () => {
        const result = await executeTool("signal_ready_to_pr", {}, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toBe("OK");
        expect(result.signal).toEqual({ type: "ready_to_pr" });
      });
    });

    describe("signal_needs_info tool", () => {
      it("should return needs_info signal with question", async () => {
        const result = await executeTool(
          "signal_needs_info",
          { question: "What database should I use?" },
          { cwd: testDir, jobId: "test-job" },
        );

        expect(result.result).toBe("OK");
        expect(result.signal).toEqual({
          type: "needs_info",
          question: "What database should I use?",
        });
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tools", async () => {
        const result = await executeTool("unknown_tool", {}, { cwd: testDir, jobId: "test-job" });

        expect(result.result).toContain("Unknown tool: unknown_tool");
      });
    });
  });
});
