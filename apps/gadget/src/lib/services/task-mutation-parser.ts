import {
  deleteSingleUpgradeTask,
  getUpgradeTasks,
  insertUpgradeTask,
  updateUpgradeTask,
} from "@/lib/actions/upgrade-tasks";

interface TaskMutations {
  updates: Array<{ id: string; title?: string; description?: string }>;
  additions: Array<{ title: string; description: string | null; step_type?: string; after_id?: string }>;
  removals: string[];
}

const MUTATION_REGEX = /<!--\s*task_mutations:\s*(\{[\s\S]*?\})\s*-->/;

export function parseTaskMutations(content: string): { cleanContent: string; mutations: TaskMutations | null } {
  const match = content.match(MUTATION_REGEX);
  if (!match) return { cleanContent: content, mutations: null };

  try {
    const raw = JSON.parse(match[1]);
    const mutations: TaskMutations = {
      updates: Array.isArray(raw.updates) ? raw.updates : [],
      additions: Array.isArray(raw.additions) ? raw.additions : [],
      removals: Array.isArray(raw.removals) ? raw.removals : [],
    };
    const cleanContent = content.replace(MUTATION_REGEX, "").trimEnd();
    return { cleanContent, mutations };
  } catch {
    return { cleanContent: content, mutations: null };
  }
}

export async function applyTaskMutations(projectId: string, mutations: TaskMutations): Promise<void> {
  // 1. Removals first (only pending/failed enforced by deleteSingleUpgradeTask)
  for (const id of mutations.removals) {
    await deleteSingleUpgradeTask(id);
  }

  // 2. Updates
  for (const update of mutations.updates) {
    const fields: Record<string, string> = {};
    if (update.title !== undefined) fields.title = update.title;
    if (update.description !== undefined) fields.description = update.description;
    if (Object.keys(fields).length > 0) {
      await updateUpgradeTask(update.id, fields);
    }
  }

  // 3. Additions — resolve after_id to order_index
  const currentTasks = await getUpgradeTasks(projectId);
  for (const addition of mutations.additions) {
    let atIndex: number;
    if (addition.after_id) {
      const refTask = currentTasks.find((t) => t.id === addition.after_id);
      atIndex = refTask ? refTask.order_index + 1 : currentTasks.length;
    } else {
      atIndex = currentTasks.length;
    }
    const inserted = await insertUpgradeTask(
      projectId,
      { title: addition.title, description: addition.description ?? null, step_type: addition.step_type },
      atIndex,
    );
    // Keep currentTasks in sync for subsequent additions
    currentTasks.push(inserted);
    currentTasks.sort((a, b) => a.order_index - b.order_index);
  }
}
