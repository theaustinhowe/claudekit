import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import {
  createUpgradeTasks,
  deleteSingleUpgradeTask,
  deleteUpgradeTasks,
  getUpgradeTasks,
  insertUpgradeTask,
  updateUpgradeTask,
} from "./upgrade-tasks";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getUpgradeTasks", () => {
  it("returns tasks ordered by order_index", async () => {
    const tasks = [
      { id: "1", project_id: "proj-1", title: "Task 1", order_index: 0 },
      { id: "2", project_id: "proj-1", title: "Task 2", order_index: 1 },
    ];
    mockQueryAll.mockResolvedValue(tasks);

    const result = await getUpgradeTasks("proj-1");
    expect(result).toEqual(tasks);
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      "SELECT * FROM upgrade_tasks WHERE project_id = ? ORDER BY order_index ASC",
      ["proj-1"],
    );
  });
});

describe("createUpgradeTasks", () => {
  it("creates multiple tasks with sequential order_index", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await createUpgradeTasks("proj-1", [
      { title: "Step 1", description: "Do step 1" },
      { title: "Step 2", description: null, step_type: "validate" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].order_index).toBe(0);
    expect(result[0].step_type).toBe("implement");
    expect(result[1].order_index).toBe(1);
    expect(result[1].step_type).toBe("validate");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe("updateUpgradeTask", () => {
  it("updates specified fields", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateUpgradeTask("task-1", { status: "completed", completed_at: "2024-01-01T00:00:00.000Z" });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("UPDATE upgrade_tasks SET"),
      expect.arrayContaining(["completed", "2024-01-01T00:00:00.000Z", "task-1"]),
    );
  });

  it("does nothing for empty updates", async () => {
    await updateUpgradeTask("task-1", {});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("skips undefined values", async () => {
    mockExecute.mockResolvedValue(undefined);

    await updateUpgradeTask("task-1", { status: "in_progress", title: undefined });
    const sql = mockExecute.mock.calls[0][1] as string;
    expect(sql).toContain("status");
    expect(sql).not.toContain("title");
  });
});

describe("deleteUpgradeTasks", () => {
  it("deletes all tasks for a project", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deleteUpgradeTasks("proj-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM upgrade_tasks WHERE project_id = ?", ["proj-1"]);
  });
});

describe("insertUpgradeTask", () => {
  it("inserts a task at a specific index and shifts others", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await insertUpgradeTask("proj-1", { title: "New Step", description: "Description" }, 2);

    expect(result.title).toBe("New Step");
    expect(result.order_index).toBe(2);
    expect(result.status).toBe("pending");
    // First call shifts existing tasks
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE upgrade_tasks SET order_index = order_index + 1 WHERE project_id = ? AND order_index >= ?",
      ["proj-1", 2],
    );
  });
});

describe("deleteSingleUpgradeTask", () => {
  it("deletes a pending task and shifts subsequent tasks", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "pending",
      order_index: 2,
    });
    mockExecute.mockResolvedValue(undefined);

    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM upgrade_tasks WHERE id = ?", ["task-1"]);
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE upgrade_tasks SET order_index = order_index - 1 WHERE project_id = ? AND order_index > ?",
      ["proj-1", 2],
    );
  });

  it("does nothing for non-existent task", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    await deleteSingleUpgradeTask("nonexistent");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("does nothing for completed task", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "completed",
      order_index: 0,
    });

    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("allows deletion of failed tasks", async () => {
    mockQueryOne.mockResolvedValue({
      id: "task-1",
      project_id: "proj-1",
      status: "failed",
      order_index: 1,
    });
    mockExecute.mockResolvedValue(undefined);

    await deleteSingleUpgradeTask("task-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM upgrade_tasks WHERE id = ?", ["task-1"]);
  });
});
