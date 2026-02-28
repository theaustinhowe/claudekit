import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  queryAll: vi.fn().mockResolvedValue([]),
  buildUpdate: vi.fn().mockReturnValue(null),
  parseJsonField: vi.fn((val: unknown, fallback: unknown) => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val;
  }),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-id"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn().mockReturnValue("impl-prompt-content"),
}));

vi.mock("@/lib/services/screenshot-service", () => ({
  deleteScreenshotFiles: vi.fn(),
}));

import { buildUpdate, execute, getDb, queryAll, queryOne } from "@/lib/db";
import { deleteScreenshotFiles } from "@/lib/services/screenshot-service";
import {
  createDesignMessage,
  createGeneratorProject,
  deleteGeneratorProject,
  getDesignMessages,
  getGeneratorProject,
  getGeneratorProjects,
  getMockData,
  getUiSpec,
  updateGeneratorProject,
} from "./generator-projects";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockQueryAll = vi.mocked(queryAll);
const mockBuildUpdate = vi.mocked(buildUpdate);
const mockDeleteScreenshotFiles = vi.mocked(deleteScreenshotFiles);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(undefined as never);
});

describe("createGeneratorProject", () => {
  it("inserts a project and returns it", async () => {
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      title: "My App",
      platform: "nextjs",
      services: "[]",
      constraints: "[]",
      design_vibes: "[]",
      inspiration_urls: "[]",
      color_scheme: "{}",
      custom_features: "[]",
      scaffold_logs: null,
    } as never);

    const result = await createGeneratorProject({
      title: "My App",
      idea_description: "A cool app",
      platform: "nextjs",
      services: ["supabase"],
      constraints: ["mobile-first"],
      project_name: "my-app",
      project_path: "/tmp",
      package_manager: "pnpm",
    });

    expect(result.id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO generator_projects"),
      expect.arrayContaining(["test-id", "My App"]),
    );
  });

  it("throws when query returns null", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    await expect(
      createGeneratorProject({
        title: "App",
        idea_description: "desc",
        platform: "nextjs",
        services: [],
        constraints: [],
        project_name: "app",
        project_path: "/tmp",
        package_manager: "npm",
      }),
    ).rejects.toThrow("Failed to create generator project");
  });

  it("passes optional fields", async () => {
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      title: "App",
      platform: "nextjs",
      services: "[]",
      constraints: "[]",
      design_vibes: '["minimal"]',
      inspiration_urls: '["https://ex.com"]',
      color_scheme: '{"primary":"#000"}',
      custom_features: '["dark-mode"]',
      scaffold_logs: null,
    } as never);

    await createGeneratorProject({
      title: "App",
      idea_description: "desc",
      platform: "nextjs",
      services: [],
      constraints: [],
      project_name: "app",
      project_path: "/tmp",
      package_manager: "npm",
      ai_provider: "openai",
      ai_model: "gpt-4",
      template_id: "tmpl-1",
      design_vibes: ["minimal"],
      inspiration_urls: ["https://ex.com"],
      color_scheme: { primary: "#000" },
      custom_features: ["dark-mode"],
    });

    const params = vi.mocked(mockExecute).mock.calls[0][2];
    expect(params).toContain("openai");
    expect(params).toContain("gpt-4");
    expect(params).toContain("tmpl-1");
  });
});

describe("getGeneratorProject", () => {
  it("returns parsed project when found", async () => {
    mockQueryOne.mockResolvedValue({
      id: "proj-1",
      services: "[]",
      constraints: "[]",
      design_vibes: "[]",
      inspiration_urls: "[]",
      color_scheme: "{}",
      custom_features: "[]",
      scaffold_logs: null,
    } as never);

    const result = await getGeneratorProject("proj-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("proj-1");
  });

  it("returns null when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    const result = await getGeneratorProject("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getGeneratorProjects", () => {
  it("returns parsed projects", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "p1",
        services: "[]",
        constraints: "[]",
        design_vibes: "[]",
        inspiration_urls: "[]",
        color_scheme: "{}",
        custom_features: "[]",
        scaffold_logs: null,
      },
      {
        id: "p2",
        services: "[]",
        constraints: "[]",
        design_vibes: "[]",
        inspiration_urls: "[]",
        color_scheme: "{}",
        custom_features: "[]",
        scaffold_logs: null,
      },
    ] as never);

    const result = await getGeneratorProjects();
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no projects", async () => {
    mockQueryAll.mockResolvedValue([] as never);
    const result = await getGeneratorProjects();
    expect(result).toEqual([]);
  });
});

describe("updateGeneratorProject", () => {
  it("calls buildUpdate and executes when there are updates", async () => {
    mockBuildUpdate.mockReturnValue({
      sql: "UPDATE generator_projects SET status = ? WHERE id = ?",
      params: ["designing", "proj-1"],
    } as never);

    await updateGeneratorProject("proj-1", { status: "designing" });
    expect(mockBuildUpdate).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does nothing when buildUpdate returns null", async () => {
    mockBuildUpdate.mockReturnValue(null as never);
    await updateGeneratorProject("proj-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("deleteGeneratorProject", () => {
  it("deletes related records and the project", async () => {
    await deleteGeneratorProject("proj-1");

    // Should delete screenshots, tasks, specs, messages, then project
    expect(mockExecute).toHaveBeenCalledTimes(5);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("DELETE FROM project_screenshots"),
      ["proj-1"],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("DELETE FROM generator_projects"),
      ["proj-1"],
    );
    expect(mockDeleteScreenshotFiles).toHaveBeenCalledWith("proj-1");
  });
});

describe("getUiSpec", () => {
  it("returns spec when found (latest version)", async () => {
    mockQueryOne.mockResolvedValue({ spec_json: '{"pages":[]}' } as never);
    const result = await getUiSpec("proj-1");
    expect(result).not.toBeNull();
  });

  it("returns spec for specific version", async () => {
    mockQueryOne.mockResolvedValue({ spec_json: '{"pages":[]}' } as never);
    const result = await getUiSpec("proj-1", 2);
    expect(result).not.toBeNull();
    expect(mockQueryOne).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("version = ?"), ["proj-1", 2]);
  });

  it("returns null when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    const result = await getUiSpec("proj-1");
    expect(result).toBeNull();
  });
});

describe("getMockData", () => {
  it("returns mock data when found", async () => {
    mockQueryOne.mockResolvedValue({ mock_data_json: '[{"entity":"User"}]' } as never);
    const result = await getMockData("proj-1", 1);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    const result = await getMockData("proj-1", 1);
    expect(result).toEqual([]);
  });
});

describe("getDesignMessages", () => {
  it("returns parsed messages", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "m1",
        role: "user",
        content: "Hello",
        spec_diff_json: null,
        progress_logs_json: null,
        suggestions_json: null,
      },
    ] as never);

    const result = await getDesignMessages("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });
});

describe("createDesignMessage", () => {
  it("creates a message and returns it", async () => {
    const result = await createDesignMessage({
      project_id: "proj-1",
      role: "user",
      content: "Hello",
    });

    expect(result.id).toBe("test-id");
    expect(result.project_id).toBe("proj-1");
    expect(result.role).toBe("user");
    expect(result.content).toBe("Hello");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("includes optional fields", async () => {
    const result = await createDesignMessage({
      project_id: "proj-1",
      role: "assistant",
      content: "Response",
      spec_diff: { added: [], removed: [], modified: [] } as never,
      model_used: "claude-3",
      progress_logs: [{ log: "working", logType: "status" }],
      suggestions: ["Try X", "Try Y"],
    });

    expect(result.model_used).toBe("claude-3");
    expect(result.suggestions).toEqual(["Try X", "Try Y"]);
  });

  it("handles null optional fields", async () => {
    const result = await createDesignMessage({
      project_id: "proj-1",
      role: "user",
      content: "Hello",
    });

    expect(result.spec_diff).toBeNull();
    expect(result.model_used).toBeNull();
    expect(result.progress_logs).toBeNull();
    expect(result.suggestions).toBeNull();
  });
});
