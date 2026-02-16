import { createDatabase } from "./connection";

/**
 * Create an in-memory DuckDB database for testing.
 * Each call returns an isolated instance — no file I/O, no global cache.
 */
export function createTestDatabase() {
  return createDatabase({ dbPath: ":memory:", useGlobalCache: false });
}
