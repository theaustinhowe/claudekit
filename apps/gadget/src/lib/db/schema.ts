import type { DuckDBConnection } from "@duckdb/node-api";
import { execute, queryOne } from "./helpers";

export async function initSchema(conn: DuckDBConnection): Promise<void> {
  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS scan_roots (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      last_scanned_at TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      policy_id TEXT,
      progress INTEGER DEFAULT 0,
      phase TEXT DEFAULT NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS scan_root_entries (
      scan_id TEXT NOT NULL,
      scan_root_id TEXT NOT NULL,
      PRIMARY KEY (scan_id, scan_root_id)
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL UNIQUE,
      git_remote TEXT,
      default_branch TEXT DEFAULT 'main',
      package_manager TEXT,
      repo_type TEXT,
      is_monorepo BOOLEAN DEFAULT false,
      github_url TEXT,
      github_account_id TEXT,
      source TEXT DEFAULT 'local',
      last_scanned_at TEXT,
      last_modified_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      expected_versions TEXT DEFAULT '{}',
      banned_dependencies TEXT DEFAULT '[]',
      allowed_package_managers TEXT DEFAULT '[]',
      preferred_package_manager TEXT DEFAULT 'pnpm',
      ignore_patterns TEXT DEFAULT '[]',
      generator_defaults TEXT DEFAULT '{}',
      repo_types TEXT DEFAULT '[]',
      is_builtin BOOLEAN DEFAULT false,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      scan_id TEXT,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      evidence TEXT,
      suggested_actions TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS fix_actions (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      finding_id TEXT,
      scan_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      impact TEXT,
      risk TEXT,
      requires_approval BOOLEAN DEFAULT false,
      diff_file TEXT,
      diff_before TEXT,
      diff_after TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS fix_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      action_filter TEXT DEFAULT '{}',
      guardrails TEXT DEFAULT '[]',
      is_builtin BOOLEAN DEFAULT true
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      scan_id TEXT,
      files TEXT NOT NULL,
      snapshot_path TEXT NOT NULL,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS apply_runs (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      scan_id TEXT,
      snapshot_id TEXT,
      status TEXT DEFAULT 'pending',
      actions_applied TEXT DEFAULT '[]',
      log TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      completed_at TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT,
      recommended_pm TEXT DEFAULT 'pnpm',
      includes TEXT DEFAULT '[]',
      base_files TEXT DEFAULT '{}',
      is_builtin BOOLEAN DEFAULT true
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS generator_runs (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      policy_id TEXT,
      intent TEXT,
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      package_manager TEXT DEFAULT 'pnpm',
      features TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      handoff_brief TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      completed_at TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      scan_id TEXT,
      format TEXT DEFAULT 'json',
      content TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS github_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      avatar_url TEXT,
      pat_encrypted TEXT NOT NULL,
      scopes TEXT DEFAULT '[]',
      is_default BOOLEAN DEFAULT false,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      last_synced_at TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS github_metadata (
      repo_id TEXT PRIMARY KEY,
      stars INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      open_prs INTEGER DEFAULT 0,
      visibility TEXT,
      default_branch TEXT,
      last_push_at TEXT,
      topics TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS concept_sources (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_id TEXT,
      github_owner TEXT,
      github_repo TEXT,
      github_default_branch TEXT,
      github_url TEXT,
      list_url TEXT,
      is_builtin BOOLEAN DEFAULT false,
      last_scanned_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      scan_id TEXT,
      source_id TEXT,
      concept_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      relative_path TEXT NOT NULL,
      content TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS concept_links (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      synced_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      UNIQUE(concept_id, repo_id)
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS custom_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'custom',
      severity TEXT NOT NULL DEFAULT 'warning',
      rule_type TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      suggested_actions TEXT DEFAULT '[]',
      policy_id TEXT,
      is_enabled BOOLEAN DEFAULT true,
      is_builtin BOOLEAN DEFAULT false,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS manual_findings (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      severity TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      details TEXT,
      evidence TEXT,
      suggested_actions TEXT DEFAULT '[]',
      is_resolved BOOLEAN DEFAULT false,
      resolved_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS policy_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      defaults TEXT DEFAULT '{}',
      category TEXT,
      is_builtin BOOLEAN DEFAULT false,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS generator_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      idea_description TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'nextjs',
      services TEXT DEFAULT '[]',
      constraints TEXT DEFAULT '[]',
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      package_manager TEXT DEFAULT 'pnpm',
      status TEXT DEFAULT 'drafting',
      active_spec_version INTEGER DEFAULT 0,
      ai_provider TEXT DEFAULT 'anthropic',
      ai_model TEXT,
      template_id TEXT,
      policy_id TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      updated_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      exported_at TEXT,
      implementation_prompt TEXT,
      repo_id TEXT,
      design_vibes TEXT DEFAULT '[]',
      inspiration_urls TEXT DEFAULT '[]',
      color_scheme TEXT DEFAULT '{}',
      custom_features TEXT DEFAULT '[]',
      scaffold_logs TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS ui_specs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      spec_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      UNIQUE(project_id, version)
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS mock_data_sets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      spec_version INTEGER NOT NULL,
      entities_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS design_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      spec_diff_json TEXT,
      progress_logs_json TEXT,
      model_used TEXT,
      suggestions_json TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS spec_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      spec_json TEXT NOT NULL,
      mock_data_json TEXT NOT NULL DEFAULT '[]',
      message_id TEXT,
      label TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS auto_fix_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      error_signature TEXT NOT NULL,
      error_message TEXT NOT NULL,
      claude_output TEXT,
      attempt_number INTEGER DEFAULT 1,
      logs_json TEXT DEFAULT '[]',
      started_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      completed_at TEXT
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS upgrade_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      order_index INTEGER NOT NULL,
      step_type TEXT DEFAULT 'implement',
      claude_output TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS project_screenshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      label TEXT,
      width INTEGER DEFAULT 1280,
      height INTEGER DEFAULT 800,
      file_size INTEGER DEFAULT 0,
      message_id TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      label TEXT NOT NULL,
      context_type TEXT,
      context_id TEXT,
      context_name TEXT,
      metadata_json TEXT DEFAULT '{}',
      progress INTEGER DEFAULT 0,
      phase TEXT,
      pid INTEGER,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR)),
      error_message TEXT,
      result_json TEXT DEFAULT '{}'
    )
  `,
  );

  await execute(
    conn,
    `
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      log TEXT NOT NULL,
      log_type TEXT DEFAULT 'status',
      created_at TEXT DEFAULT (CAST(current_timestamp AS VARCHAR))
    )
  `,
  );

  // Create indexes
  await execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_roots_path ON scan_roots(path)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_findings_repo_scan ON findings(repo_id, scan_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_fix_actions_repo ON fix_actions(repo_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_fix_actions_repo_scan ON fix_actions(repo_id, scan_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concepts_repo ON concepts(repo_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concepts_type ON concepts(concept_type)");
  await execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_concepts_repo_path ON concepts(repo_id, relative_path)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concept_links_concept ON concept_links(concept_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concept_links_repo ON concept_links(repo_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concept_sources_type ON concept_sources(source_type)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_concepts_source ON concepts(source_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_custom_rules_policy ON custom_rules(policy_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_custom_rules_enabled ON custom_rules(is_enabled)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_manual_findings_repo ON manual_findings(repo_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_policy_templates_category ON policy_templates(category)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_generator_projects_status ON generator_projects(status)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_ui_specs_project ON ui_specs(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_mock_data_sets_project ON mock_data_sets(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_design_messages_project ON design_messages(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_spec_snapshots_project ON spec_snapshots(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_auto_fix_runs_project ON auto_fix_runs(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_upgrade_tasks_project ON upgrade_tasks(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_screenshots_project ON project_screenshots(project_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context_type, context_id)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)");
  await execute(conn, "CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id)");

  // Check if we need to seed (only seed once, tracked by seeded_at flag)
  const seeded = await queryOne<{ value: string }>(conn, "SELECT value FROM settings WHERE key = 'seeded_at'");
  if (!seeded) {
    const { seedDatabase } = await import("./seed");
    await seedDatabase(conn);
  }
}
