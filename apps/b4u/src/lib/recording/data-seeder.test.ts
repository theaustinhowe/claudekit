import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  rename: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

import { existsSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { injectEnvOverrides, restoreProject } from "./data-seeder";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseSeedConfig = {
  entities: [],
  authOverrides: [],
  envItems: [],
};

describe("injectEnvOverrides", () => {
  it("writes .env.local with B4U_RECORDING marker", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await injectEnvOverrides("/project", baseSeedConfig);

    expect(writeFile).toHaveBeenCalledWith("/project/.env.local", expect.stringContaining("B4U_RECORDING=true"));
  });

  it("backs up existing .env.local", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    await injectEnvOverrides("/project", baseSeedConfig);

    expect(rename).toHaveBeenCalledWith("/project/.env.local", "/project/.env.local.b4u-backup");
  });

  it("includes enabled env items as env vars", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await injectEnvOverrides("/project", {
      ...baseSeedConfig,
      envItems: [
        { id: "skip-auth", label: "Skip Auth", enabled: true },
        { id: "mock-data", label: "Mock Data", enabled: false },
        { id: "demo-mode", label: "Demo Mode", enabled: true },
      ],
    });

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain("SKIP_AUTH=true");
    expect(written).toContain("DEMO_MODE=true");
    expect(written).not.toContain("MOCK_DATA");
  });

  it("does not backup when no existing .env.local", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await injectEnvOverrides("/project", baseSeedConfig);

    expect(rename).not.toHaveBeenCalled();
  });
});

describe("restoreProject", () => {
  it("restores backup if it exists", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes("backup"));

    await restoreProject("/project");

    expect(rename).toHaveBeenCalledWith("/project/.env.local.b4u-backup", "/project/.env.local");
  });

  it("removes created .env.local if no backup", async () => {
    vi.mocked(existsSync).mockImplementation((p) => !String(p).includes("backup"));

    await restoreProject("/project");

    expect(unlink).toHaveBeenCalledWith("/project/.env.local");
  });

  it("does nothing when neither backup nor .env.local exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await restoreProject("/project");

    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it("ignores errors during cleanup", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(rename).mockRejectedValue(new Error("EACCES"));

    await expect(restoreProject("/project")).resolves.toBeUndefined();
  });
});
