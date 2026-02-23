import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Todo {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  updatedAt?: string;
}

const TODOS_DIR = join(homedir(), ".claudekit", "todos");

function ensureDir() {
  if (!existsSync(TODOS_DIR)) {
    mkdirSync(TODOS_DIR, { recursive: true });
  }
}

export function readTodos(appId: string): Todo[] {
  ensureDir();
  const file = join(TODOS_DIR, `${appId}.json`);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Todo[];
  } catch {
    return [];
  }
}

export function writeTodos(appId: string, todos: Todo[]): void {
  ensureDir();
  const file = join(TODOS_DIR, `${appId}.json`);
  writeFileSync(file, JSON.stringify(todos, null, 2));
}

export function readAllTodos(appIds: string[]): Record<string, Todo[]> {
  const result: Record<string, Todo[]> = {};
  for (const id of appIds) {
    result[id] = readTodos(id);
  }
  return result;
}
