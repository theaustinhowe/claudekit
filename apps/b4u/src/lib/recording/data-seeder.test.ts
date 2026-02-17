import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { detectSeedMechanism, injectEnvOverrides, restoreProject, runSeedScript } from "./data-seeder";

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

describe("detectSeedMechanism", () => {
  it("finds prisma/seed.ts", () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("prisma/seed.ts"));

    const result = detectSeedMechanism("/project");

    expect(result).toEqual({ type: "prisma", path: "/project/prisma/seed.ts" });
  });

  it("finds prisma/seed.js when .ts does not exist", () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("prisma/seed.js"));

    const result = detectSeedMechanism("/project");

    expect(result).toEqual({ type: "prisma", path: "/project/prisma/seed.js" });
  });

  it("finds drizzle/seed.ts", () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("drizzle/seed.ts"));

    const result = detectSeedMechanism("/project");

    expect(result).toEqual({ type: "drizzle", path: "/project/drizzle/seed.ts" });
  });

  it("finds scripts/seed.ts as generic script", () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("scripts/seed.ts"));

    const result = detectSeedMechanism("/project");

    expect(result).toEqual({ type: "script", path: "/project/scripts/seed.ts" });
  });

  it("returns none when no seed files found", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = detectSeedMechanism("/project");

    expect(result).toEqual({ type: "none", path: null });
  });
});

describe("runSeedScript", () => {
  beforeEach(() => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") callback(null, { stdout: "", stderr: "" });
      return undefined as never;
    }) as never);
  });

  it("runs npx prisma db seed for prisma mechanism", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("prisma/seed.ts"));

    await runSeedScript("/project");

    expect(execFile).toHaveBeenCalledWith(
      "npx",
      ["prisma", "db", "seed"],
      expect.objectContaining({ cwd: "/project", timeout: 60_000 }),
      expect.any(Function),
    );
  });

  it("runs npx tsx for drizzle .ts seed", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("drizzle/seed.ts"));

    await runSeedScript("/project");

    expect(execFile).toHaveBeenCalledWith(
      "npx",
      ["tsx", "/project/drizzle/seed.ts"],
      expect.objectContaining({ cwd: "/project", timeout: 60_000 }),
      expect.any(Function),
    );
  });

  it("runs node for script .js seed", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("scripts/seed.js"));

    await runSeedScript("/project");

    expect(execFile).toHaveBeenCalledWith(
      "node",
      ["/project/scripts/seed.js"],
      expect.objectContaining({ cwd: "/project", timeout: 60_000 }),
      expect.any(Function),
    );
  });

  it("does nothing for none mechanism when no package.json seed script", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await runSeedScript("/project");

    expect(execFile).not.toHaveBeenCalled();
  });

  it("handles exec error gracefully for none mechanism with package.json", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("package.json"));
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ scripts: { seed: "node seed.js" } }));
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") callback(new Error("Command failed"), { stdout: "", stderr: "" });
      return undefined as never;
    }) as never);

    await expect(runSeedScript("/project")).resolves.toBeUndefined();
  });
});

describe("injectEnvOverrides - B4U_MOCK_DATA", () => {
  it("includes B4U_MOCK_DATA when entities are non-empty", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const entities = [{ name: "User", count: 10, note: "test users" }];
    await injectEnvOverrides("/project", { ...baseSeedConfig, entities });

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain("B4U_MOCK_DATA=");
    expect(written).toContain(JSON.stringify(entities));
  });

  it("does not include B4U_MOCK_DATA when entities are empty", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await injectEnvOverrides("/project", baseSeedConfig);

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).not.toContain("B4U_MOCK_DATA");
  });
});

describe("detectPackageManager via runSeedScript", () => {
  beforeEach(() => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: unknown, _opts: unknown, callback: unknown) => {
      if (typeof callback === "function") callback(null, { stdout: "", stderr: "" });
      return undefined as never;
    }) as never);
  });

  it("detects pnpm when pnpm-lock.yaml exists", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.endsWith("package.json") || s.endsWith("pnpm-lock.yaml");
    });
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ scripts: { seed: "node seed.js" } }));

    await runSeedScript("/project");

    expect(execFile).toHaveBeenCalledWith(
      "pnpm",
      ["run", "seed"],
      expect.objectContaining({ cwd: "/project" }),
      expect.any(Function),
    );
  });

  it("defaults to npm when no lock files exist", async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith("package.json"));
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ scripts: { seed: "node seed.js" } }));

    await runSeedScript("/project");

    expect(execFile).toHaveBeenCalledWith(
      "npm",
      ["run", "seed"],
      expect.objectContaining({ cwd: "/project" }),
      expect.any(Function),
    );
  });
});
