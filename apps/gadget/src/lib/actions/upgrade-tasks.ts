"use server";

import { getDb } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/db/helpers";
import type { UpgradeTask } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

export async function getUpgradeTasks(projectId: string): Promise<UpgradeTask[]> {
  const db = await getDb();
  return queryAll<UpgradeTask>(db, "SELECT * FROM upgrade_tasks WHERE project_id = ? ORDER BY order_index ASC", [
    projectId,
  ]);
}

export async function createUpgradeTasks(
  projectId: string,
  tasks: { title: string; description: string | null; step_type?: "validate" | "implement" | "env_setup" }[],
): Promise<UpgradeTask[]> {
  const db = await getDb();
  const created: UpgradeTask[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const id = generateId();
    const stepType = task.step_type || "implement";
    await execute(
      db,
      "INSERT INTO upgrade_tasks (id, project_id, title, description, status, order_index, step_type) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      [id, projectId, task.title, task.description, i, stepType],
    );
    created.push({
      id,
      project_id: projectId,
      title: task.title,
      description: task.description,
      status: "pending",
      order_index: i,
      step_type: stepType,
      claude_output: null,
      started_at: null,
      completed_at: null,
      created_at: nowTimestamp(),
    });
  }

  return created;
}

export async function updateUpgradeTask(
  id: string,
  updates: Partial<
    Pick<
      UpgradeTask,
      "status" | "claude_output" | "started_at" | "completed_at" | "title" | "description" | "order_index" | "step_type"
    >
  >,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    params.push(value);
  }

  if (sets.length === 0) return;

  params.push(id);
  await execute(db, `UPDATE upgrade_tasks SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteUpgradeTasks(projectId: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM upgrade_tasks WHERE project_id = ?", [projectId]);
}

export async function insertUpgradeTask(
  projectId: string,
  task: { title: string; description: string | null; step_type?: string },
  atIndex: number,
): Promise<UpgradeTask> {
  const db = await getDb();
  // Shift subsequent tasks down
  await execute(
    db,
    "UPDATE upgrade_tasks SET order_index = order_index + 1 WHERE project_id = ? AND order_index >= ?",
    [projectId, atIndex],
  );
  const id = generateId();
  const stepType = task.step_type || "implement";
  const now = nowTimestamp();
  await execute(
    db,
    "INSERT INTO upgrade_tasks (id, project_id, title, description, status, order_index, step_type) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [id, projectId, task.title, task.description, atIndex, stepType],
  );
  return {
    id,
    project_id: projectId,
    title: task.title,
    description: task.description,
    status: "pending",
    order_index: atIndex,
    step_type: stepType as UpgradeTask["step_type"],
    claude_output: null,
    started_at: null,
    completed_at: null,
    created_at: now,
  };
}

export async function deleteSingleUpgradeTask(id: string): Promise<void> {
  const db = await getDb();
  const task = await queryOne<UpgradeTask>(db, "SELECT * FROM upgrade_tasks WHERE id = ?", [id]);
  if (!task) return;
  if (task.status !== "pending" && task.status !== "failed") return;
  await execute(db, "DELETE FROM upgrade_tasks WHERE id = ?", [id]);
  // Shift subsequent tasks up
  await execute(db, "UPDATE upgrade_tasks SET order_index = order_index - 1 WHERE project_id = ? AND order_index > ?", [
    task.project_id,
    task.order_index,
  ]);
}
