import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as upgradeTasks from "@/lib/actions/upgrade-tasks";
import { applyTaskMutations, parseTaskMutations } from "@/lib/services/task-mutation-parser";

vi.mock("@/lib/actions/upgrade-tasks", () => ({
  deleteSingleUpgradeTask: vi.fn(),
  getUpgradeTasks: vi.fn().mockResolvedValue([]),
  insertUpgradeTask: vi
    .fn()
    .mockImplementation((_projectId: string, task: Record<string, unknown>, orderIndex: number) =>
      Promise.resolve({ ...task, id: "new-id", order_index: orderIndex }),
    ),
  updateUpgradeTask: vi.fn(),
}));

describe("parseTaskMutations", () => {
  it("returns null mutations when no mutation block present", () => {
    const content = "Some plain text without mutations";
    const result = parseTaskMutations(content);
    expect(result.cleanContent).toBe(content);
    expect(result.mutations).toBeNull();
  });

  it("extracts mutations from HTML comment block", () => {
    const mutations = {
      updates: [{ id: "t1", title: "Updated title" }],
      additions: [{ title: "New task", description: "Do something" }],
      removals: ["t2"],
    };
    const content = `Some text\n<!-- task_mutations: ${JSON.stringify(mutations)} -->\nMore text`;
    const result = parseTaskMutations(content);
    expect(result.mutations).toEqual(mutations);
  });

  it("removes the mutation block from content", () => {
    const mutations = { updates: [], additions: [], removals: [] };
    const content = `Before\n<!-- task_mutations: ${JSON.stringify(mutations)} -->\nAfter`;
    const result = parseTaskMutations(content);
    expect(result.cleanContent).toBe("Before\n\nAfter");
  });

  it("trims trailing whitespace from clean content", () => {
    const mutations = { updates: [], additions: [], removals: [] };
    const content = `Text <!-- task_mutations: ${JSON.stringify(mutations)} -->   `;
    const result = parseTaskMutations(content);
    expect(result.cleanContent).toBe("Text");
  });

  it("returns null mutations for invalid JSON", () => {
    const content = "<!-- task_mutations: {invalid json} -->";
    const result = parseTaskMutations(content);
    expect(result.mutations).toBeNull();
    expect(result.cleanContent).toBe(content);
  });

  it("defaults missing arrays to empty", () => {
    const content = '<!-- task_mutations: {"updates": null} -->';
    const result = parseTaskMutations(content);
    expect(result.mutations).toEqual({
      updates: [],
      additions: [],
      removals: [],
    });
  });

  it("handles mutations with only updates", () => {
    const mutations = {
      updates: [{ id: "t1", title: "New title", description: "New desc" }],
    };
    const content = `<!-- task_mutations: ${JSON.stringify(mutations)} -->`;
    const result = parseTaskMutations(content);
    expect(result.mutations?.updates).toHaveLength(1);
    expect(result.mutations?.additions).toEqual([]);
    expect(result.mutations?.removals).toEqual([]);
  });

  it("handles mutations with only additions", () => {
    const mutations = {
      additions: [{ title: "Task A", description: null, step_type: "manual" }],
    };
    const content = `<!-- task_mutations: ${JSON.stringify(mutations)} -->`;
    const result = parseTaskMutations(content);
    expect(result.mutations?.additions).toHaveLength(1);
    expect(result.mutations?.updates).toEqual([]);
    expect(result.mutations?.removals).toEqual([]);
  });

  it("handles mutations with only removals", () => {
    const mutations = { removals: ["id1", "id2"] };
    const content = `<!-- task_mutations: ${JSON.stringify(mutations)} -->`;
    const result = parseTaskMutations(content);
    expect(result.mutations?.removals).toEqual(["id1", "id2"]);
    expect(result.mutations?.updates).toEqual([]);
    expect(result.mutations?.additions).toEqual([]);
  });

  it("handles whitespace variations in the comment tag", () => {
    const mutations = { updates: [], additions: [], removals: ["x"] };
    const content = `<!--  task_mutations:  ${JSON.stringify(mutations)}  -->`;
    const result = parseTaskMutations(content);
    expect(result.mutations?.removals).toEqual(["x"]);
  });

  it("handles additions with after_id", () => {
    const mutations = {
      additions: [{ title: "After task", description: "desc", after_id: "ref-id" }],
    };
    const content = `<!-- task_mutations: ${JSON.stringify(mutations)} -->`;
    const result = parseTaskMutations(content);
    expect(result.mutations?.additions[0].after_id).toBe("ref-id");
  });
});

describe("applyTaskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(upgradeTasks.getUpgradeTasks).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls deleteSingleUpgradeTask for each removal", async () => {
    await applyTaskMutations("proj1", {
      updates: [],
      additions: [],
      removals: ["id1", "id2"],
    });
    expect(upgradeTasks.deleteSingleUpgradeTask).toHaveBeenCalledTimes(2);
    expect(upgradeTasks.deleteSingleUpgradeTask).toHaveBeenCalledWith("id1");
    expect(upgradeTasks.deleteSingleUpgradeTask).toHaveBeenCalledWith("id2");
  });

  it("calls updateUpgradeTask for each update with fields", async () => {
    await applyTaskMutations("proj1", {
      updates: [{ id: "t1", title: "New Title" }],
      additions: [],
      removals: [],
    });
    expect(upgradeTasks.updateUpgradeTask).toHaveBeenCalledWith("t1", { title: "New Title" });
  });

  it("skips updates with no fields", async () => {
    await applyTaskMutations("proj1", {
      updates: [{ id: "t1" }],
      additions: [],
      removals: [],
    });
    expect(upgradeTasks.updateUpgradeTask).not.toHaveBeenCalled();
  });

  it("calls insertUpgradeTask for additions", async () => {
    await applyTaskMutations("proj1", {
      updates: [],
      additions: [{ title: "New Task", description: "desc" }],
      removals: [],
    });
    expect(upgradeTasks.insertUpgradeTask).toHaveBeenCalledWith(
      "proj1",
      { title: "New Task", description: "desc", step_type: undefined },
      0,
    );
  });

  it("resolves after_id to order_index", async () => {
    vi.mocked(upgradeTasks.getUpgradeTasks).mockResolvedValue([
      { id: "existing", order_index: 5, title: "Existing", description: null } as never,
    ]);
    await applyTaskMutations("proj1", {
      updates: [],
      additions: [{ title: "After existing", description: null, after_id: "existing" }],
      removals: [],
    });
    expect(upgradeTasks.insertUpgradeTask).toHaveBeenCalledWith(
      "proj1",
      { title: "After existing", description: null, step_type: undefined },
      6,
    );
  });

  it("falls back to end of list when after_id not found", async () => {
    vi.mocked(upgradeTasks.getUpgradeTasks).mockResolvedValue([
      { id: "a", order_index: 0, title: "A", description: null } as never,
    ]);
    await applyTaskMutations("proj1", {
      updates: [],
      additions: [{ title: "New", description: null, after_id: "nonexistent" }],
      removals: [],
    });
    expect(upgradeTasks.insertUpgradeTask).toHaveBeenCalledWith(
      "proj1",
      { title: "New", description: null, step_type: undefined },
      1,
    );
  });
});
