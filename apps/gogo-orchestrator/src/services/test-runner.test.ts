import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/duckdb", () => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
  parseJsonField: vi.fn((val: unknown, fallback: unknown) => {
    if (val === null || val === undefined) return fallback;
    try {
      return typeof val === "string" ? JSON.parse(val) : val;
    } catch {
      return fallback;
    }
  }),
}));
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));
vi.mock("../ws/handler.js", () => ({
  sendLogToSubscribers: vi.fn(),
}));

import { execute, queryOne } from "@devkit/duckdb";
import { getMaxTestRetries, getTestCommands, runTests } from "./test-runner.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("test-runner", () => {
  describe("getTestCommands", () => {
    it("returns commands from settings", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "testCommands",
        value: JSON.stringify("npm test\nnpm run lint"),
      });

      const commands = await getTestCommands();

      expect(commands).toEqual(["npm test", "npm run lint"]);
    });

    it("returns default ['npm test'] when no settings", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const commands = await getTestCommands();

      expect(commands).toEqual(["npm test"]);
    });

    it("returns default when value is not a string", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "testCommands",
        value: JSON.stringify(12345),
      });

      const commands = await getTestCommands();

      expect(commands).toEqual(["npm test"]);
    });

    it("filters out empty lines from commands", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "testCommands",
        value: JSON.stringify("npm test\n\n\nnpm run lint\n"),
      });

      const commands = await getTestCommands();

      expect(commands).toEqual(["npm test", "npm run lint"]);
    });
  });

  describe("getMaxTestRetries", () => {
    it("returns max retries from settings", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "maxTestRetries",
        value: "5",
      });

      const retries = await getMaxTestRetries();

      expect(retries).toBe(5);
    });

    it("returns default 3 when no settings", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const retries = await getMaxTestRetries();

      expect(retries).toBe(3);
    });

    it("returns default 3 when value is NaN", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "maxTestRetries",
        value: JSON.stringify("not-a-number"),
      });

      const retries = await getMaxTestRetries();

      expect(retries).toBe(3);
    });

    it("enforces minimum of 1", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "maxTestRetries",
        value: "0",
      });

      const retries = await getMaxTestRetries();

      expect(retries).toBe(1);
    });

    it("floors decimal values", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        key: "maxTestRetries",
        value: "3.7",
      });

      const retries = await getMaxTestRetries();

      expect(retries).toBe(3);
    });
  });

  describe("runTests", () => {
    it("skips tests when customTestCommand is null", async () => {
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await runTests("job-1", "/tmp/work", { sequence: 0 }, null);

      expect(result.success).toBe(true);
      expect(result.commandsRun).toEqual([]);
      expect(result.output).toContain("Tests skipped");
    });

    it("skips tests when customTestCommand is empty string", async () => {
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await runTests("job-1", "/tmp/work", { sequence: 0 }, "");

      expect(result.success).toBe(true);
      expect(result.commandsRun).toEqual([]);
    });

    it("skips tests when customTestCommand is whitespace", async () => {
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await runTests("job-1", "/tmp/work", { sequence: 0 }, "   ");

      expect(result.success).toBe(true);
      expect(result.commandsRun).toEqual([]);
    });
  });
});
