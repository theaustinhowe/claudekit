import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

import { execute, getDb, queryOne } from "@/lib/db";
import { getSetting, getSettings, setSetting } from "./settings";

const mockGetDb = vi.mocked(getDb);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe("settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getSetting", () => {
    it("returns value when setting exists", async () => {
      mockQueryOne.mockResolvedValue({ value: "true" });

      const result = await getSetting("ignore_bots");
      expect(result).toBe("true");
      expect(mockQueryOne).toHaveBeenCalledWith({}, "SELECT value FROM settings WHERE key = ?", ["ignore_bots"]);
    });

    it("returns null when setting does not exist", async () => {
      mockQueryOne.mockResolvedValue(undefined);

      const result = await getSetting("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("setSetting", () => {
    it("upserts a setting value", async () => {
      await setSetting("ignore_bots", "false");

      expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO settings"), [
        "ignore_bots",
        "false",
      ]);
    });
  });

  describe("getSettings", () => {
    it("returns map of existing settings", async () => {
      mockQueryOne.mockImplementation((_db, _sql, params) => {
        const key = (params as string[])[0];
        if (key === "ignore_bots") return Promise.resolve({ value: "true" });
        if (key === "temperature") return Promise.resolve({ value: "0.7" });
        return Promise.resolve(undefined);
      });

      const result = await getSettings(["ignore_bots", "temperature", "missing_key"]);
      expect(result).toEqual({ ignore_bots: "true", temperature: "0.7" });
    });

    it("returns empty object for no matching keys", async () => {
      mockQueryOne.mockResolvedValue(undefined);
      const result = await getSettings(["a", "b"]);
      expect(result).toEqual({});
    });
  });
});
