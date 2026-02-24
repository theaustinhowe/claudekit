import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  queryAll: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("test-task-id"),
  nowTimestamp: vi.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import {
  createUpgradeTasks,
  deleteSingleUpgradeTask,
  deleteUpgradeTasks,
  getUpgradeTasks,
  insertUpgradeTask,
  updateUpgradeTask,
} from "./upgrade-tasks";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryOne = vi.mocked(queryOne);
const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  mockExecute.mockResolvedValue(undefined as never);
});

describe("getUpgradeTasks", () => {
  it("returns tasks for a project", async () => {
    mockQueryAll.mockResolvedValue([{ id: "t1", title: "Task 1" }] as never);
    const result = await getUpgradeTasks("proj-1");
    expect(result).toHaveLength(1);
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("SELECT * FROM upgrade_tasks"),
      ["proj-1"],
    );
  });
});

describe("createUpgradeTasks", () => {
  it("creates multiple tasks with correct order_index", async () => {
    const tasks = [
      { title: "Validate", description: "Validate approach", step_type: "validate" as const },
      { title: "Implement auth", description: "Set up auth" },
    ];
    const result = await createUpgradeTasks("proj-1", tasks);
    expect(result).toHaveLength(2);
    expect(result[0].order_index).toBe(0);
    expect(result[0].step_type).toBe("validate");
    expect(result[1].order_index).toBe(1);
    expect(result[1].step_type).toBe("implement");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("defaults step_type to implement", async () => {
    const result = await createUpgradeTasks("proj-1", [{ title: "Some task", description: null }]);
    expect(result[0].step_type).toBe("implement");
  });
});

describe("updateUpgradeTask", () => {
  it("updates task fields", async () => {
    await updateUpgradeTask("task-1", { status: "completed", title: "Updated title" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE upgrade_tasks SET"),
      expect.arrayContaining(["completed", "Updated title", "task-1"]),
    );
  });

  it("skips update when no fields provided", async () => {
    await updateUpgradeTask("task-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("skips undefined values", async () => {
    await updateUpgradeTask("task-1", { status: "completed", title: undefined });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("deleteUpgradeTasks", () => {
  it("deletes all tasks for a project", async () => {
    await deleteUpgradeTasks("proj-1");
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("DELETE FROM upgrade_tasks"), [
      "proj-1",
    ]);
  });
});

describe("insertUpgradeTask", () => {
  it("inserts task at specified index and shifts others", async () => {
    const result = await insertUpgradeTask("proj-1", { title: "New task", description: "desc" }, 2);
    // Should shift existing tasks first, then insert
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.title).toBe("New task");
    expect(result.order_index).toBe(2);
    expect(result.status).toBe("pending");
  });

  it("defaults step_type to implement", async () => {
    const result = await insertUpgradeTask("proj-1", { title: "Task", description: null }, 0);
    expect(result.step_type).toBe("implement");
  });
});

describe("deleteSingleUpgradeTask", () => {
  it("deletes task when it exists and is pending", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "pending",
      order_index: 1,
    } as never);
    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).toHaveBeenCalledTimes(2); // DELETE + shift
  });

  it("deletes task when it exists and is failed", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "failed",
      order_index: 1,
    } as never);
    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("does not delete task with completed status", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "completed",
      order_index: 1,
    } as never);
    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("does nothing when task not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);
    await deleteSingleUpgradeTask("nonexistent");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
