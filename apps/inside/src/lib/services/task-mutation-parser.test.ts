import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/upgrade-tasks", () => ({
  deleteSingleUpgradeTask: vi.fn(),
  getUpgradeTasks: vi.fn(),
  insertUpgradeTask: vi.fn(),
  updateUpgradeTask: vi.fn(),
}));

import {
  deleteSingleUpgradeTask,
  getUpgradeTasks,
  insertUpgradeTask,
  updateUpgradeTask,
} from "@/lib/actions/upgrade-tasks";
import { applyTaskMutations, parseTaskMutations } from "./task-mutation-parser";

const mockDelete = vi.mocked(deleteSingleUpgradeTask);
const mockGetTasks = vi.mocked(getUpgradeTasks);
const mockInsert = vi.mocked(insertUpgradeTask);
const mockUpdate = vi.mocked(updateUpgradeTask);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("parseTaskMutations", () => {
  it("extracts valid task_mutations block", () => {
    const content = `Some output text
<!-- task_mutations: {"updates": [{"id": "1", "title": "Updated"}], "additions": [], "removals": []} -->`;

    const result = parseTaskMutations(content);
    expect(result.mutations).not.toBeNull();
    expect(result.mutations!.updates).toEqual([{ id: "1", title: "Updated" }]);
    expect(result.mutations!.additions).toEqual([]);
    expect(result.mutations!.removals).toEqual([]);
  });

  it("returns null mutations for content with no mutation block", () => {
    const result = parseTaskMutations("Just some plain text output");
    expect(result.mutations).toBeNull();
    expect(result.cleanContent).toBe("Just some plain text output");
  });

  it("returns null mutations for malformed JSON", () => {
    const content = '<!-- task_mutations: {invalid json} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations).toBeNull();
    expect(result.cleanContent).toBe(content);
  });

  it("strips the mutation block from cleanContent", () => {
    const content = `Output text here
<!-- task_mutations: {"updates": [], "additions": [], "removals": []} -->`;

    const result = parseTaskMutations(content);
    expect(result.cleanContent).toBe("Output text here");
    expect(result.cleanContent).not.toContain("task_mutations");
  });

  it("handles empty arrays in updates/additions/removals", () => {
    const content = '<!-- task_mutations: {"updates": [], "additions": [], "removals": []} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations).toEqual({ updates: [], additions: [], removals: [] });
  });

  it("handles missing keys — defaults to empty arrays", () => {
    const content = '<!-- task_mutations: {} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations).toEqual({ updates: [], additions: [], removals: [] });
  });

  it("handles mutations with only removals", () => {
    const content = '<!-- task_mutations: {"removals": ["task-1", "task-2"]} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations!.removals).toEqual(["task-1", "task-2"]);
    expect(result.mutations!.updates).toEqual([]);
    expect(result.mutations!.additions).toEqual([]);
  });

  it("handles non-array values — defaults to empty arrays", () => {
    const content = '<!-- task_mutations: {"updates": "not-an-array", "additions": 42} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations!.updates).toEqual([]);
    expect(result.mutations!.additions).toEqual([]);
  });
});

describe("applyTaskMutations", () => {
  it("applies removals, then updates, then additions in order", async () => {
    const callOrder: string[] = [];

    mockDelete.mockImplementation(async () => {
      callOrder.push("delete");
    });
    mockUpdate.mockImplementation(async () => {
      callOrder.push("update");
    });
    mockGetTasks.mockResolvedValue([]);
    mockInsert.mockImplementation(async (_pid, _data, _idx) => {
      callOrder.push("insert");
      return { id: "new-1", order_index: 0 } as ReturnType<typeof insertUpgradeTask> extends Promise<infer T>
        ? T
        : never;
    });

    await applyTaskMutations("proj-1", {
      removals: ["task-del"],
      updates: [{ id: "task-upd", title: "New Title" }],
      additions: [{ title: "New Task", description: "Desc" }],
    });

    expect(callOrder).toEqual(["delete", "update", "insert"]);
  });

  it("resolves after_id to correct order_index", async () => {
    mockGetTasks.mockResolvedValue([
      { id: "t1", order_index: 0 } as any,
      { id: "t2", order_index: 1 } as any,
      { id: "t3", order_index: 2 } as any,
    ]);
    mockInsert.mockResolvedValue({ id: "t4", order_index: 2 } as any);

    await applyTaskMutations("proj-1", {
      removals: [],
      updates: [],
      additions: [{ title: "After T2", description: null, after_id: "t2" }],
    });

    expect(mockInsert).toHaveBeenCalledWith("proj-1", { title: "After T2", description: null, step_type: undefined }, 2);
  });

  it("appends to end when after_id is not found", async () => {
    mockGetTasks.mockResolvedValue([
      { id: "t1", order_index: 0 } as any,
      { id: "t2", order_index: 1 } as any,
    ]);
    mockInsert.mockResolvedValue({ id: "t3", order_index: 2 } as any);

    await applyTaskMutations("proj-1", {
      removals: [],
      updates: [],
      additions: [{ title: "Orphan", description: null, after_id: "nonexistent" }],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      "proj-1",
      { title: "Orphan", description: null, step_type: undefined },
      2, // length of currentTasks
    );
  });

  it("does not call updateUpgradeTask when update has no fields", async () => {
    await applyTaskMutations("proj-1", {
      removals: [],
      updates: [{ id: "task-1" }], // no title or description
      additions: [],
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls deleteSingleUpgradeTask for each removal", async () => {
    await applyTaskMutations("proj-1", {
      removals: ["t1", "t2", "t3"],
      updates: [],
      additions: [],
    });

    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(mockDelete).toHaveBeenCalledWith("t1");
    expect(mockDelete).toHaveBeenCalledWith("t2");
    expect(mockDelete).toHaveBeenCalledWith("t3");
  });
});
