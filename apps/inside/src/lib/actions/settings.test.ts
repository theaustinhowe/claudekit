import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/utils", () => ({
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

import { cast } from "@claudekit/test-utils";
import { execute, getDb, queryOne } from "@/lib/db";
import { getSetting, setSetting } from "./settings";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
});

describe("getSetting", () => {
  it("returns value when setting exists", async () => {
    mockQueryOne.mockResolvedValue(cast({ value: "my-value" }));
    const result = await getSetting("my-key");
    expect(result).toBe("my-value");
  });

  it("returns null when setting does not exist", async () => {
    mockQueryOne.mockResolvedValue(cast(undefined));
    const result = await getSetting("missing-key");
    expect(result).toBeNull();
  });
});

describe("setSetting", () => {
  it("executes upsert query", async () => {
    mockExecute.mockResolvedValue(cast(undefined));
    await setSetting("my-key", "my-value");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO settings"),
      expect.arrayContaining(["my-key", "my-value"]),
    );
  });
});
