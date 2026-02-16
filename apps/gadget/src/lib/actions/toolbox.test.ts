import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/lib/constants/tools", () => ({
  DEFAULT_TOOL_IDS: ["tool-a", "tool-b"],
}));

import { getSetting, setSetting } from "@/lib/actions/settings";
import { getToolboxToolIds, setToolboxToolIds } from "./toolbox";

const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getToolboxToolIds", () => {
  it("returns default tool IDs when setting is not set", async () => {
    mockGetSetting.mockResolvedValue(null);
    const result = await getToolboxToolIds();
    expect(result).toEqual(["tool-a", "tool-b"]);
  });

  it("returns parsed tool IDs from setting", async () => {
    mockGetSetting.mockResolvedValue('["custom-1","custom-2"]');
    const result = await getToolboxToolIds();
    expect(result).toEqual(["custom-1", "custom-2"]);
  });

  it("returns defaults for invalid JSON", async () => {
    mockGetSetting.mockResolvedValue("not-json");
    const result = await getToolboxToolIds();
    expect(result).toEqual(["tool-a", "tool-b"]);
  });

  it("returns defaults for empty array", async () => {
    mockGetSetting.mockResolvedValue("[]");
    const result = await getToolboxToolIds();
    expect(result).toEqual(["tool-a", "tool-b"]);
  });
});

describe("setToolboxToolIds", () => {
  it("saves tool IDs as JSON", async () => {
    mockSetSetting.mockResolvedValue(undefined);
    await setToolboxToolIds(["tool-x", "tool-y"]);
    expect(mockSetSetting).toHaveBeenCalledWith("toolbox_tools", '["tool-x","tool-y"]');
  });
});
