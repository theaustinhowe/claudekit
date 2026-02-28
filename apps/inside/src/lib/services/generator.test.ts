import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-id-123"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

// We need to test the internal functions via the module, but they're not exported.
// We'll test generateProject which is exported, plus test the internal logic
// by calling generateProject with different templates.

import { execSync } from "node:child_process";
import fs from "node:fs";
import { cast } from "@claudekit/test-utils";
import { execute, getDb, queryOne } from "@/lib/db";
import { generateProject } from "./generator";

const mockFs = vi.mocked(fs);
const mockExecSync = vi.mocked(execSync);
const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);

beforeEach(() => {
  vi.resetAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(cast(undefined));
  mockFs.existsSync.mockReturnValue(false);
  process.env.HOME = "/Users/testuser";
});

describe("generateProject", () => {
  it("returns error when template not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await generateProject({
      templateId: "nonexistent",
      intent: "test",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Template not found");
  });

  it("generates a nextjs project successfully", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-1",
        name: "Next.js",
        type: "nextjs",
      }),
    );
    mockFs.existsSync.mockReturnValue(false);

    const progress: string[] = [];
    const result = await generateProject({
      templateId: "tmpl-1",
      intent: "build app",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
      onProgress: (msg) => progress.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.handoffBrief).toContain("my-app");
    expect(result.projectPath).toBe("/tmp/my-app");
    expect(progress.some((p) => p.includes("Generating project"))).toBe(true);
    expect(progress.some((p) => p.includes("[SUCCESS]"))).toBe(true);
  });

  it("generates a node project successfully", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-2",
        name: "Node.js",
        type: "node",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-2",
      intent: "build api",
      projectName: "my-api",
      projectPath: "/tmp",
      packageManager: "npm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
  });

  it("generates a library project successfully", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-3",
      intent: "build library",
      projectName: "my-lib",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(true);
  });

  it("generates a monorepo project successfully", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-4",
        name: "Monorepo",
        type: "monorepo",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-4",
      intent: "build monorepo",
      projectName: "my-mono",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(5);
  });

  it("adds tailwind dependency when feature is included", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-1",
        name: "Next.js",
        type: "nextjs",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-1",
      intent: "build app",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: ["tailwind"],
      gitInit: false,
    });

    expect(result.success).toBe(true);
  });

  it("adds supabase dependency when feature is included", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-1",
        name: "Next.js",
        type: "nextjs",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-1",
      intent: "build app",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: ["supabase"],
      gitInit: false,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
  });

  it("initializes git when gitInit is true", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );
    mockExecSync.mockReturnValue(Buffer.from(""));

    const progress: string[] = [];
    const result = await generateProject({
      templateId: "tmpl-3",
      intent: "build lib",
      projectName: "my-lib",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: true,
      onProgress: (msg) => progress.push(msg),
    });

    expect(result.success).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith("git init", expect.any(Object));
    expect(progress.some((p) => p.includes("Git repository initialized"))).toBe(true);
  });

  it("handles git init failure gracefully", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );
    mockExecSync.mockImplementation(() => {
      throw new Error("git not found");
    });

    const progress: string[] = [];
    const result = await generateProject({
      templateId: "tmpl-3",
      intent: "build lib",
      projectName: "my-lib",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: true,
      onProgress: (msg) => progress.push(msg),
    });

    expect(result.success).toBe(true);
    expect(progress.some((p) => p.includes("Git init failed"))).toBe(true);
  });

  it("handles file write errors", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-1",
        name: "Next.js",
        type: "nextjs",
      }),
    );
    mockFs.mkdirSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await generateProject({
      templateId: "tmpl-1",
      intent: "build app",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("expands tilde in project path", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-3",
      intent: "build lib",
      projectName: "my-lib",
      projectPath: "~/projects",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(true);
  });

  it("includes handoff brief with correct content", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-1",
        name: "Next.js",
        type: "nextjs",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-1",
      intent: "build app",
      projectName: "my-app",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: ["tailwind"],
      gitInit: false,
    });

    expect(result.success).toBe(true);
    expect(result.handoffBrief).toContain("my-app");
    expect(result.handoffBrief).toContain("nextjs");
    expect(result.handoffBrief).toContain("pnpm");
    expect(result.handoffBrief).toContain("tailwind");
  });

  it("creates DB records for generator runs", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );

    await generateProject({
      templateId: "tmpl-3",
      intent: "build lib",
      projectName: "my-lib",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    // INSERT and UPDATE for generator_runs
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("handles policyId when provided", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "tmpl-3",
        name: "Library",
        type: "library",
      }),
    );

    const result = await generateProject({
      templateId: "tmpl-3",
      policyId: "policy-1",
      intent: "build lib",
      projectName: "my-lib",
      projectPath: "/tmp",
      packageManager: "pnpm",
      features: [],
      gitInit: false,
    });

    expect(result.success).toBe(true);
  });
});
