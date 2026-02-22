import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  buildUpdate: vi.fn(),
  parseJsonField: vi.fn((val, fallback) => {
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
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));
vi.mock("@/lib/services/scaffold-prompt", () => ({
  buildImplementationPrompt: vi.fn(() => "Generated implementation prompt"),
}));
vi.mock("@/lib/services/screenshot-service", () => ({
  deleteScreenshotFiles: vi.fn(),
}));

import { buildUpdate, execute, queryAll, queryOne } from "@/lib/db";
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

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockBuildUpdate = vi.mocked(buildUpdate);
const mockDeleteScreenshotFiles = vi.mocked(deleteScreenshotFiles);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createGeneratorProject", () => {
  it("creates a project with required fields", async () => {
    mockExecute.mockResolvedValue(undefined);
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
    });

    const result = await createGeneratorProject({
      title: "My App",
      idea_description: "A cool app",
      platform: "nextjs",
      services: [],
      constraints: [],
      project_name: "my-app",
      project_path: "/projects",
      package_manager: "pnpm",
    });

    expect(result.title).toBe("My App");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO generator_projects"),
      expect.arrayContaining(["test-id", "My App", "A cool app", "nextjs"]),
    );
  });

  it("throws when project creation fails", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await expect(
      createGeneratorProject({
        title: "Fail",
        idea_description: "desc",
        platform: "nextjs",
        services: [],
        constraints: [],
        project_name: "fail",
        project_path: "/",
        package_manager: "npm",
      }),
    ).rejects.toThrow("Failed to create generator project");
  });
});

describe("getGeneratorProject", () => {
  it("returns a project by id", async () => {
    mockQueryOne.mockResolvedValue({
      id: "proj-1",
      title: "My Project",
      services: "[]",
      constraints: "[]",
      design_vibes: "[]",
      inspiration_urls: "[]",
      color_scheme: "{}",
      custom_features: "[]",
      scaffold_logs: null,
    });

    const result = await getGeneratorProject("proj-1");
    expect(result).not.toBeNull();
    expect(result?.title).toBe("My Project");
  });

  it("returns null when not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getGeneratorProject("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getGeneratorProjects", () => {
  it("returns all projects", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "1",
        title: "Proj 1",
        services: "[]",
        constraints: "[]",
        design_vibes: "[]",
        inspiration_urls: "[]",
        color_scheme: "{}",
        custom_features: "[]",
        scaffold_logs: null,
      },
    ]);

    const result = await getGeneratorProjects();
    expect(result).toHaveLength(1);
  });
});

describe("updateGeneratorProject", () => {
  it("updates project using buildUpdate", async () => {
    mockBuildUpdate.mockReturnValue({
      sql: "UPDATE generator_projects SET status = ? WHERE id = ?",
      params: ["designing", "proj-1"],
    });
    mockExecute.mockResolvedValue(undefined);

    await updateGeneratorProject("proj-1", { status: "designing" });
    expect(mockExecute).toHaveBeenCalled();
  });

  it("does nothing when buildUpdate returns null", async () => {
    mockBuildUpdate.mockReturnValue(null as never);

    await updateGeneratorProject("proj-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("deleteGeneratorProject", () => {
  it("deletes project and all related data", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deleteGeneratorProject("proj-1");
    // Should delete from 4 related tables + the project itself
    expect(mockExecute).toHaveBeenCalledTimes(5);
    expect(mockDeleteScreenshotFiles).toHaveBeenCalledWith("proj-1");
  });
});

describe("getUiSpec", () => {
  it("returns latest spec when no version specified", async () => {
    mockQueryOne.mockResolvedValue({ spec_json: '{"pages":[]}' });

    const result = await getUiSpec("proj-1");
    expect(result).toEqual({ pages: [] });
  });

  it("returns spec from native JSON column", async () => {
    mockQueryOne.mockResolvedValue({ spec_json: { version: 2 } });

    const result = await getUiSpec("proj-1", 2);
    expect(result).toEqual({ version: 2 });
  });

  it("returns null when no spec exists", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getUiSpec("proj-1");
    expect(result).toBeNull();
  });
});

describe("getMockData", () => {
  it("returns parsed mock entities", async () => {
    mockQueryOne.mockResolvedValue({ mock_data_json: '[{"name":"User"}]' });

    const result = await getMockData("proj-1", 1);
    expect(result).toEqual([{ name: "User" }]);
  });

  it("returns mock entities from native JSON column", async () => {
    mockQueryOne.mockResolvedValue({ mock_data_json: [{ name: "User" }] });

    const result = await getMockData("proj-1", 1);
    expect(result).toEqual([{ name: "User" }]);
  });

  it("returns empty array when no data", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getMockData("proj-1", 1);
    expect(result).toEqual([]);
  });
});

describe("getDesignMessages", () => {
  it("returns messages with parsed JSON fields", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "msg-1",
        role: "user",
        content: "Hello",
        spec_diff_json: null,
        progress_logs_json: null,
        suggestions_json: '["suggestion1"]',
      },
    ]);

    const result = await getDesignMessages("proj-1");
    expect(result).toHaveLength(1);
    expect(result[0].suggestions).toEqual(["suggestion1"]);
  });
});

describe("createDesignMessage", () => {
  it("creates a message and returns it", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createDesignMessage({
      project_id: "proj-1",
      role: "user",
      content: "Build me a dashboard",
    });

    expect(result.content).toBe("Build me a dashboard");
    expect(result.role).toBe("user");
    expect(result.id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO design_messages"),
      expect.arrayContaining(["test-id", "proj-1", "user", "Build me a dashboard"]),
    );
  });

  it("creates a message with all optional fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createDesignMessage({
      project_id: "proj-1",
      role: "assistant",
      content: "Here's the design",
      spec_diff: { added: [], removed: [], changed: [] } as never,
      model_used: "claude-3",
      progress_logs: [{ log: "Step 1", logType: "info" }],
      suggestions: ["Add auth"],
    });

    expect(result.model_used).toBe("claude-3");
  });
});
