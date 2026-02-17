import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  AUTH_OVERRIDES,
  CHAPTER_MARKERS,
  ENV_ITEMS,
  FILE_TREE,
  FLOW_SCRIPTS,
  MOCK_DATA_ENTITIES,
  PROJECT_SUMMARY,
  ROUTES,
  TIMELINE_MARKERS,
  USER_FLOWS,
  VOICE_OPTIONS,
  VOICEOVER_SCRIPTS,
} from "../src/lib/mock-data";

const SEED_RUN_ID = "__seed__";

const SCHEMA_SQL = fs.readFileSync(
  path.join(new URL(".", import.meta.url).pathname, "../src/lib/db/migrations/001_initial.sql"),
  "utf-8",
);

const DB_PATH = process.env.DATABASE_PATH || "data/b4u.duckdb";

function escapeStr(s: string): string {
  return s.replace(/'/g, "''");
}

function arrayLiteral(arr: string[]): string {
  return `['${arr.map(escapeStr).join("', '")}']`;
}

async function seed() {
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const instance = await DuckDBInstance.create(DB_PATH);
  const conn = await instance.connect();

  console.log("Creating schema...");
  await conn.run(SCHEMA_SQL);

  // --- Clean existing seed data ---
  console.log("Cleaning existing seed data...");
  for (const table of [
    "session_logs",
    "sessions",
    "timeline_markers",
    "chapter_markers",
    "voiceover_scripts",
    "script_steps",
    "flow_scripts",
    "env_items",
    "auth_overrides",
    "mock_data_entities",
    "user_flows",
    "routes",
    "file_tree",
    "project_summary",
  ]) {
    await conn.run(`DELETE FROM ${table} WHERE run_id = '${SEED_RUN_ID}'`);
  }
  await conn.run("DELETE FROM voice_options");

  // --- Project Summary ---
  console.log("Seeding project_summary...");
  await conn.run(`
    INSERT INTO project_summary (id, run_id, name, framework, directories, auth, database_info)
    VALUES (1, '${SEED_RUN_ID}', '${escapeStr(PROJECT_SUMMARY.name)}', '${escapeStr(PROJECT_SUMMARY.framework)}',
      ${arrayLiteral(PROJECT_SUMMARY.directories)},
      '${escapeStr(PROJECT_SUMMARY.auth)}', '${escapeStr(PROJECT_SUMMARY.database)}')
  `);

  // --- File Tree (stored as JSON) ---
  console.log("Seeding file_tree...");
  await conn.run(`
    INSERT INTO file_tree (id, run_id, tree_json)
    VALUES (1, '${SEED_RUN_ID}', '${escapeStr(JSON.stringify(FILE_TREE))}')
  `);

  // --- Routes ---
  console.log("Seeding routes...");
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    await conn.run(`
      INSERT INTO routes (id, run_id, path, title, auth_required, description)
      VALUES (${i + 1}, '${SEED_RUN_ID}', '${escapeStr(r.path)}', '${escapeStr(r.title)}', ${r.authRequired}, '${escapeStr(r.description)}')
    `);
  }

  // --- User Flows ---
  console.log("Seeding user_flows...");
  for (const f of USER_FLOWS) {
    await conn.run(`
      INSERT INTO user_flows (id, run_id, name, steps)
      VALUES ('${escapeStr(f.id)}', '${SEED_RUN_ID}', '${escapeStr(f.name)}', ${arrayLiteral(f.steps)})
    `);
  }

  // --- Mock Data Entities ---
  console.log("Seeding mock_data_entities...");
  for (let i = 0; i < MOCK_DATA_ENTITIES.length; i++) {
    const e = MOCK_DATA_ENTITIES[i];
    await conn.run(`
      INSERT INTO mock_data_entities (id, run_id, name, count, note)
      VALUES (${i + 1}, '${SEED_RUN_ID}', '${escapeStr(e.name)}', ${e.count}, '${escapeStr(e.note)}')
    `);
  }

  // --- Auth Overrides ---
  console.log("Seeding auth_overrides...");
  for (const a of AUTH_OVERRIDES) {
    await conn.run(`
      INSERT INTO auth_overrides (id, run_id, label, enabled)
      VALUES ('${escapeStr(a.id)}', '${SEED_RUN_ID}', '${escapeStr(a.label)}', ${a.enabled})
    `);
  }

  // --- Environment Items ---
  console.log("Seeding env_items...");
  for (const e of ENV_ITEMS) {
    await conn.run(`
      INSERT INTO env_items (id, run_id, label, enabled)
      VALUES ('${escapeStr(e.id)}', '${SEED_RUN_ID}', '${escapeStr(e.label)}', ${e.enabled})
    `);
  }

  // --- Flow Scripts ---
  console.log("Seeding flow_scripts and script_steps...");
  for (let i = 0; i < FLOW_SCRIPTS.length; i++) {
    const fs = FLOW_SCRIPTS[i];
    await conn.run(`
      INSERT INTO flow_scripts (id, run_id, flow_id, flow_name)
      VALUES (${i + 1}, '${SEED_RUN_ID}', '${escapeStr(fs.flowId)}', '${escapeStr(fs.flowName)}')
    `);
    for (const step of fs.steps) {
      await conn.run(`
        INSERT INTO script_steps (id, run_id, flow_id, step_number, url, action, expected_outcome, duration)
        VALUES ('${escapeStr(step.id)}', '${SEED_RUN_ID}', '${escapeStr(fs.flowId)}', ${step.stepNumber},
          '${escapeStr(step.url)}', '${escapeStr(step.action)}',
          '${escapeStr(step.expectedOutcome)}', '${escapeStr(step.duration)}')
      `);
    }
  }

  // --- Voiceover Scripts ---
  console.log("Seeding voiceover_scripts...");
  for (const [flowId, paragraphs] of Object.entries(VOICEOVER_SCRIPTS)) {
    for (let i = 0; i < paragraphs.length; i++) {
      await conn.run(`
        INSERT INTO voiceover_scripts (run_id, flow_id, paragraph_index, text)
        VALUES ('${SEED_RUN_ID}', '${escapeStr(flowId)}', ${i}, '${escapeStr(paragraphs[i])}')
      `);
    }
  }

  // --- Voice Options ---
  console.log("Seeding voice_options...");
  for (const v of VOICE_OPTIONS) {
    await conn.run(`
      INSERT INTO voice_options (id, name, style)
      VALUES ('${escapeStr(v.id)}', '${escapeStr(v.name)}', '${escapeStr(v.style)}')
    `);
  }

  // --- Timeline Markers ---
  console.log("Seeding timeline_markers...");
  let tmId = 1;
  for (const [flowId, markers] of Object.entries(TIMELINE_MARKERS)) {
    for (const m of markers) {
      await conn.run(`
        INSERT INTO timeline_markers (id, run_id, flow_id, timestamp, label, paragraph_index)
        VALUES (${tmId++}, '${SEED_RUN_ID}', '${escapeStr(flowId)}', '${escapeStr(m.timestamp)}',
          '${escapeStr(m.label)}', ${m.paragraphIndex})
      `);
    }
  }

  // --- Chapter Markers ---
  console.log("Seeding chapter_markers...");
  for (let i = 0; i < CHAPTER_MARKERS.length; i++) {
    const c = CHAPTER_MARKERS[i];
    await conn.run(`
      INSERT INTO chapter_markers (id, run_id, flow_name, start_time)
      VALUES (${i + 1}, '${SEED_RUN_ID}', '${escapeStr(c.flowName)}', '${escapeStr(c.startTime)}')
    `);
  }

  conn.closeSync();
  instance.closeSync();
  console.log(`\nDatabase seeded successfully at: ${DB_PATH}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
