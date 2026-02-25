import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";

/**
 * DuckDB does not allow concurrent access from multiple processes — even in READ_ONLY mode.
 * To browse databases while the owning apps are running, we copy the .duckdb file to a
 * temp location and open the snapshot there. Snapshots are refreshed on each getConnection()
 * call to stay reasonably current.
 */

const SNAPSHOT_DIR = path.join(os.tmpdir(), "ducktails-snapshots");

interface SnapshotEntry {
  conn: DuckDBConnection;
  instance: DuckDBInstance;
  snapshotPath: string;
  copiedAt: number;
}

interface ConnectionCache {
  __ducktails_snapshots?: Map<string, SnapshotEntry>;
  __ducktails_promises?: Map<string, Promise<DuckDBConnection>>;
}

const cache = globalThis as ConnectionCache;

const SNAPSHOT_TTL_MS = 5_000; // Re-copy if snapshot is older than 5 seconds

function getSnapshotsMap(): Map<string, SnapshotEntry> {
  if (!cache.__ducktails_snapshots) {
    cache.__ducktails_snapshots = new Map();
  }
  return cache.__ducktails_snapshots;
}

function getPromisesMap(): Map<string, Promise<DuckDBConnection>> {
  if (!cache.__ducktails_promises) {
    cache.__ducktails_promises = new Map();
  }
  return cache.__ducktails_promises;
}

function snapshotPath(dbPath: string): string {
  // Create a unique filename from the original path
  const hash = dbPath.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(SNAPSHOT_DIR, `${hash}.duckdb`);
}

export function databaseFileExists(dbPath: string): boolean {
  return fs.existsSync(dbPath);
}

export async function getConnection(dbPath: string): Promise<DuckDBConnection> {
  const snapshots = getSnapshotsMap();
  const existing = snapshots.get(dbPath);
  if (existing && Date.now() - existing.copiedAt < SNAPSHOT_TTL_MS) {
    return existing.conn;
  }

  const promises = getPromisesMap();
  const pending = promises.get(dbPath);
  if (pending) return pending;

  const promise = (async () => {
    // Close previous snapshot if any
    if (existing) {
      try {
        existing.conn.closeSync();
      } catch {}
      snapshots.delete(dbPath);
      try {
        fs.unlinkSync(existing.snapshotPath);
        fs.unlinkSync(`${existing.snapshotPath}.wal`);
      } catch {}
    }

    // Ensure snapshot dir exists
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

    const destPath = snapshotPath(dbPath);

    // Copy the database file (skip WAL — it belongs to the running process)
    fs.copyFileSync(dbPath, destPath);

    // Open in normal mode — it's a disposable copy, no need for READ_ONLY
    // (READ_ONLY still tries to lock the file on some DuckDB versions)
    const instance = await DuckDBInstance.create(destPath);
    const conn = await instance.connect();

    snapshots.set(dbPath, {
      conn,
      instance,
      snapshotPath: destPath,
      copiedAt: Date.now(),
    });
    promises.delete(dbPath);

    return conn;
  })();

  promises.set(dbPath, promise);
  return promise;
}

/** Get the timestamp (ms since epoch) when the snapshot for this db was last created. */
export function getSnapshotTime(dbPath: string): number | null {
  const entry = getSnapshotsMap().get(dbPath);
  return entry ? entry.copiedAt : null;
}

export function closeConnection(dbPath: string): void {
  const snapshots = getSnapshotsMap();
  const entry = snapshots.get(dbPath);
  if (entry) {
    try {
      entry.conn.closeSync();
    } catch {}
    try {
      fs.unlinkSync(entry.snapshotPath);
      fs.unlinkSync(`${entry.snapshotPath}.wal`);
    } catch {}
    snapshots.delete(dbPath);
  }
}

export function closeAllConnections(): void {
  const snapshots = getSnapshotsMap();
  for (const [dbPath] of snapshots) {
    closeConnection(dbPath);
  }
}

/**
 * Open a short-lived writable connection for mutations (insert/update/delete).
 * This will fail if the owning app holds a write lock.
 * Caller must close the connection after use.
 */
export async function getWritableConnection(dbPath: string): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(dbPath);
  return instance.connect();
}
