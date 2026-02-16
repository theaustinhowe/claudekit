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

import { queryOne } from "@devkit/duckdb";
import { getMaxTestRetries, getTestCommands } from "./test-runner.js";

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
  });
});
