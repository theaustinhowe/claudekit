import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { DatabaseEntry } from "../types";

const home = homedir();

// process.cwd() points to apps/ducktails in Next.js, go up 2 levels for monorepo root
const repoRoot = resolve(process.cwd(), "../..");

export const DATABASE_REGISTRY: DatabaseEntry[] = [
  {
    id: "gadget",
    name: "Gadget",
    app: "apps/gadget",
    path: join(home, ".gadget", "data.duckdb"),
  },
  {
    id: "inspector",
    name: "Inspector",
    app: "apps/inspector",
    path: join(home, ".inspector", "data.duckdb"),
  },
  {
    id: "inside",
    name: "Inside",
    app: "apps/inside",
    path: join(home, ".inside", "data.duckdb"),
  },
  {
    id: "b4u",
    name: "B4U",
    app: "apps/b4u",
    path: join(repoRoot, "apps", "b4u", "data", "b4u.duckdb"),
  },
  {
    id: "gogo",
    name: "GoGo",
    app: "apps/gogo-orchestrator",
    path: join(repoRoot, "apps", "gogo-orchestrator", "data", "gogo.duckdb"),
  },
];

export function getDatabaseEntry(id: string): DatabaseEntry | undefined {
  return DATABASE_REGISTRY.find((db) => db.id === id);
}
