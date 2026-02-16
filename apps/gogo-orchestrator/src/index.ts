import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

// Load root .env/.env.local for shared env vars (override: false so app-specific wins)
const rootDir = resolve(import.meta.dirname, "../../..");
const rootEnv = resolve(rootDir, ".env");
const rootEnvLocal = resolve(rootDir, ".env.local");
if (existsSync(rootEnv)) config({ path: rootEnv, override: false });
if (existsSync(rootEnvLocal)) config({ path: rootEnvLocal, override: false });

import { execute, queryAll } from "./db/helpers.js";
import { getConn, initializeDatabase } from "./db/index.js";
import { createServer } from "./server.js";
import { runDataPruning } from "./services/data-pruning.js";
import { startPolling } from "./services/polling.js";
import { recoverOrphanedPrs } from "./services/pr-recovery.js";
import { cleanupOrphanedProcesses, clearStalePidReferences } from "./services/process-manager.js";
import { validateStartupSettings } from "./services/settings-helper.js";
import { registerShutdownHandlers } from "./services/shutdown.js";
import { checkBinaries, formatValidationResults } from "./utils/binary-check.js";
import { createServiceLogger } from "./utils/logger.js";

const log = createServiceLogger("startup");

async function main() {
  // 0. Initialize database connection (DuckDB)
  await initializeDatabase();
  log.info("Database connection initialized");

  // 1. Check binary dependencies
  const binaryCheck = await checkBinaries();
  log.info("Binary check completed");
  if (!binaryCheck.allRequiredFound) {
    log.error(formatValidationResults(binaryCheck));
    process.exit(1);
  }
  // Log optional missing binaries as warnings
  for (const missing of binaryCheck.missingOptional) {
    log.warn({ binary: missing.name }, "Optional binary not found");
  }

  // 2. Register shutdown handlers first
  registerShutdownHandlers();
  log.info("Shutdown handlers registered");

  // 3. Cleanup orphaned processes from previous crashed runs
  const cleanup = await cleanupOrphanedProcesses();
  if (cleanup.found > 0) {
    log.info({ terminated: cleanup.terminated, found: cleanup.found }, "Cleaned up orphaned processes");
  }

  // 4. Per AGENTS.md: On restart, set RUNNING and PLANNING jobs to PAUSED
  // (awaiting_plan_approval stays as-is since no process is running)
  const conn = getConn();

  // First, get the list of RUNNING/PLANNING jobs so we can create audit events
  const runningJobs = await queryAll<{ id: string; status: string }>(
    conn,
    "SELECT id, status FROM jobs WHERE status = ?",
    ["running"],
  );

  const planningJobs = await queryAll<{ id: string; status: string }>(
    conn,
    "SELECT id, status FROM jobs WHERE status = ?",
    ["planning"],
  );

  const jobsToPause = [...runningJobs, ...planningJobs];

  if (jobsToPause.length > 0) {
    const now = new Date().toISOString();

    // Update running jobs to PAUSED
    if (runningJobs.length > 0) {
      await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?", [
        "paused",
        "orchestrator restarted",
        now,
        "running",
      ]);
    }

    // Update planning jobs to PAUSED
    if (planningJobs.length > 0) {
      await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?", [
        "paused",
        "orchestrator restarted",
        now,
        "planning",
      ]);
    }

    // Create audit trail events for each paused job
    for (const job of jobsToPause) {
      await execute(
        conn,
        "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
        [
          job.id,
          "state_change",
          job.status,
          "paused",
          "Orchestrator restarted - job paused for safety",
          JSON.stringify({ triggeredBy: "orchestrator_restart" }),
          now,
        ],
      );
    }

    log.info(
      {
        count: jobsToPause.length,
        running: runningJobs.length,
        planning: planningJobs.length,
      },
      "Paused active jobs and created audit events",
    );
  }

  // 5. Clear stale PID references (processes that no longer exist)
  const cleared = await clearStalePidReferences();
  if (cleared > 0) {
    log.info({ count: cleared }, "Cleared stale PID references");
  }

  // 6. Recover orphaned PRs (PRs created before DB reset)
  const recovery = await recoverOrphanedPrs();
  if (recovery.jobsRecovered > 0) {
    log.info(
      {
        recovered: recovery.jobsRecovered,
        scanned: recovery.prsScanned,
        repos: recovery.repositoriesChecked,
      },
      "Recovered jobs from orphaned PRs",
    );
  }
  for (const error of recovery.errors) {
    log.warn({ detail: error }, "PR recovery warning");
  }

  // 6.5. Prune old data (logs, events, archived jobs)
  await runDataPruning();

  const validation = await validateStartupSettings();

  // Log warnings (non-fatal)
  for (const warning of validation.warnings) {
    log.warn(warning);
  }

  // Log errors and fail if critical
  for (const error of validation.errors) {
    log.error(error);
  }

  if (!validation.ready) {
    log.error("Critical configuration errors found. Please fix the issues above and restart.");
    process.exit(1);
  }

  // Log configuration status
  if (validation.hasActiveRepositories) {
    log.info("Active repositories configured - polling will create jobs automatically");
  } else {
    log.info("No repositories configured - jobs must be created manually");
  }

  // Start server
  const server = await createServer();
  const port = Number.parseInt(process.env.PORT || "2201", 10);
  await server.listen({ port, host: "0.0.0.0" });
  log.info({ port }, "Orchestrator running");

  // Start polling
  await startPolling();
  log.info("Polling started");
}

main().catch((err) => log.error({ err }, "Fatal startup error"));
