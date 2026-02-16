import { execute, queryOne } from "./helpers.js";
import { getConn, initializeDatabase } from "./index.js";
import type { DbJob, DbRepository } from "./schema.js";

async function seed() {
  // Initialize the database connection first
  await initializeDatabase();
  const conn = getConn();

  console.log("Seeding database...");

  // Create default repository
  const repo = await queryOne<DbRepository>(
    conn,
    `INSERT INTO repositories (owner, name, display_name, github_token, workdir_path, trigger_label, base_branch, poll_interval_ms, test_command, agent_provider, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      "example",
      "repo",
      "example/repo",
      "ghp_placeholder",
      "/tmp/agent-worktrees",
      "agent",
      "main",
      30000,
      "npm test",
      "claude-code",
      false,
    ],
  );

  if (repo) {
    console.log("Created default repository:", repo.id);

    // Insert sample job linked to repository
    const job = await queryOne<DbJob>(
      conn,
      `INSERT INTO jobs (repository_id, issue_number, issue_url, issue_title, issue_body, status)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        repo.id,
        1,
        "https://github.com/example/repo/issues/1",
        "Sample issue for testing",
        "This is a sample issue body.",
        "queued",
      ],
    );

    if (job) {
      console.log("Created sample job:", job.id);

      // Insert sample event
      await execute(
        conn,
        `INSERT INTO job_events (job_id, event_type, from_status, to_status, message)
         VALUES (?, ?, ?, ?, ?)`,
        [job.id, "state_change", null, "queued", "Job created from GitHub issue"],
      );
      console.log("Inserted sample event");

      // Insert sample logs
      await execute(conn, `INSERT INTO job_logs (job_id, stream, content, sequence) VALUES (?, ?, ?, ?)`, [
        job.id,
        "system",
        "Job initialized",
        1,
      ]);
      await execute(conn, `INSERT INTO job_logs (job_id, stream, content, sequence) VALUES (?, ?, ?, ?)`, [
        job.id,
        "stdout",
        "Cloning repository...",
        2,
      ]);
      console.log("Inserted sample logs");
    }
  } else {
    console.log("Default repository already exists, skipping seed");
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
