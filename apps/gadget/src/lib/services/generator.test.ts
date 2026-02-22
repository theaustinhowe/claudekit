import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies before importing the module under test
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-run-id"),
  nowTimestamp: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
}));

import { execute, getDb, queryOne } from "@/lib/db";
import { generateProject } from "./generator";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockExecSync = vi.mocked(execSync);

describe("generateProject", () => {
  const baseOptions = {
    templateId: "tmpl-1",
    intent: "Create a new project",
    projectName: "my-app",
    projectPath: "/tmp/projects",
    packageManager: "pnpm",
    features: [] as string[],
    gitInit: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOME = "/home/testuser";
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when template is not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await generateProject(baseOptions);

    expect(result).toEqual({ success: false, error: "Template not found" });
  });

  it("creates a generator run record on start", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject(baseOptions);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO generator_runs"),
      expect.arrayContaining(["test-run-id", "tmpl-1"]),
    );
  });

  it("generates files for a library template", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library Template",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(true);
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("generates nextjs-specific files for nextjs template", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Next.js Template",
      type: "nextjs",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(true);
    // Should write layout.tsx, page.tsx, next.config.ts among others
    const writtenPaths = mockWriteFileSync.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths.some((p) => p.endsWith("layout.tsx"))).toBe(true);
    expect(writtenPaths.some((p) => p.endsWith("page.tsx"))).toBe(true);
    expect(writtenPaths.some((p) => p.endsWith("next.config.ts"))).toBe(true);
  });

  it("generates node-specific files for node template", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Node Template",
      type: "node",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(true);
    const writtenPaths = mockWriteFileSync.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths.some((p) => p.endsWith("src/index.ts"))).toBe(true);
  });

  it("generates monorepo structure for monorepo template", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Monorepo Template",
      type: "monorepo",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(true);
    const writtenPaths = mockWriteFileSync.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths.some((p) => p.includes("pnpm-workspace.yaml"))).toBe(true);
    expect(writtenPaths.some((p) => p.includes("apps/web/package.json"))).toBe(true);
    expect(writtenPaths.some((p) => p.includes("packages/shared/package.json"))).toBe(true);
  });

  it("includes supabase files when supabase feature is enabled", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Next.js Template",
      type: "nextjs",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject({
      ...baseOptions,
      features: ["supabase"],
    });

    expect(result.success).toBe(true);
    const writtenPaths = mockWriteFileSync.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths.some((p) => p.includes(".env.local.example"))).toBe(true);
    expect(writtenPaths.some((p) => p.includes("supabase.ts"))).toBe(true);
  });

  it("includes tailwind dev dependency when tailwind feature is enabled", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library Template",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject({
      ...baseOptions,
      features: ["tailwind"],
    });

    expect(result.success).toBe(true);
    // Check that the package.json written contains tailwindcss
    const pkgCall = mockWriteFileSync.mock.calls.find((call) => String(call[0]).endsWith("package.json"));
    expect(pkgCall).toBeDefined();
    const pkgContent = JSON.parse(String(pkgCall?.[1]));
    expect(pkgContent.devDependencies.tailwindcss).toBeDefined();
  });

  it("initializes git repo when gitInit is true", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject({ ...baseOptions, gitInit: true });

    expect(mockExecSync).toHaveBeenCalledWith("git init", expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith("git add .", expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith(
      'git commit -m "Initial commit from Gadget Generator"',
      expect.anything(),
    );
  });

  it("does not initialize git when gitInit is false", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject({ ...baseOptions, gitInit: false });

    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("handles git init failure gracefully", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });
    mockExecSync.mockImplementation(() => {
      throw new Error("git not found");
    });

    const progressMessages: string[] = [];
    const result = await generateProject({
      ...baseOptions,
      gitInit: true,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(result.success).toBe(true);
    expect(progressMessages.some((m) => m.includes("[WARN]"))).toBe(true);
  });

  it("calls onProgress with status messages", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const progressMessages: string[] = [];
    await generateProject({
      ...baseOptions,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(progressMessages.some((m) => m.includes("[INFO] Generating project"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("[INFO] Template:"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("[SUCCESS]"))).toBe(true);
  });

  it("generates a handoff brief on success", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(true);
    expect(result.handoffBrief).toBeDefined();
    expect(result.handoffBrief).toContain("Handoff Brief: my-app");
    expect(result.handoffBrief).toContain("pnpm install");
  });

  it("updates the run record to done on success", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject(baseOptions);

    const updateCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("UPDATE generator_runs") && call[1].includes("done"),
    );
    expect(updateCall).toBeDefined();
  });

  it("updates run record to error on failure and returns error", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });
    mockMkdirSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await generateProject(baseOptions);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Permission denied");

    const errorUpdateCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("UPDATE generator_runs") && call[1].includes("error"),
    );
    expect(errorUpdateCall).toBeDefined();
  });

  it("expands tilde in project path", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    const result = await generateProject({
      ...baseOptions,
      projectPath: "~/projects",
    });

    expect(result.success).toBe(true);
    expect(result.projectPath).toBe("/home/testuser/projects/my-app");
  });

  it("creates subdirectories for nested files", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Next.js Template",
      type: "nextjs",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject(baseOptions);

    // Should have called mkdirSync for src/app/ etc.
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining("src"), { recursive: true });
  });

  it("includes biome.json in generated files", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject(baseOptions);

    const writtenPaths = mockWriteFileSync.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths.some((p) => p.endsWith("biome.json"))).toBe(true);
  });

  it("passes policyId to generator run record", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject({ ...baseOptions, policyId: "pol-1" });

    const insertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO generator_runs"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[2] as unknown[];
    expect(params).toContain("pol-1");
  });

  it("uses null when policyId is not provided", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });

    await generateProject(baseOptions);

    const insertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO generator_runs"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[2] as unknown[];
    // policyId should be null when not provided
    expect(params?.[2]).toBeNull();
  });

  it("does not re-create directory if it already exists", async () => {
    mockQueryOne.mockResolvedValue({
      id: "tmpl-1",
      name: "Library",
      type: "library",
      description: null,
      recommended_pm: "pnpm",
      includes: [],
      base_files: {},
      is_builtin: true,
    });
    // Simulate the project directory already existing
    mockExistsSync.mockImplementation((p) => {
      return String(p) === path.join("/tmp/projects", "my-app");
    });

    await generateProject(baseOptions);

    // mkdirSync should NOT be called with the project root path
    // (but it will be called for subdirectories of files)
    const rootMkdirCalls = mockMkdirSync.mock.calls.filter(
      (call) => String(call[0]) === path.join("/tmp/projects", "my-app"),
    );
    expect(rootMkdirCalls).toHaveLength(0);
  });
});
