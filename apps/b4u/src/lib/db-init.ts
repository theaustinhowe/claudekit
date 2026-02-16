import { execute } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/schema";

const MIGRATIONS_SQL = `
ALTER TABLE run_state ADD COLUMN IF NOT EXISTS project_path VARCHAR;
ALTER TABLE run_state ADD COLUMN IF NOT EXISTS project_name VARCHAR;
`;

let initialized = false;

export async function ensureDatabase(): Promise<void> {
  if (initialized) return;
  await execute(SCHEMA_SQL);
  await execute(MIGRATIONS_SQL);
  initialized = true;
}
