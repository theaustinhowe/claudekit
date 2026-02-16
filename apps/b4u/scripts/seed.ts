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
import { SCHEMA_SQL } from "../src/lib/schema";

const DB_PATH = process.env.DUCKDB_PATH || "data/b4u.duckdb";

function escapeStr(s: string): string {
  return s.replace(/'/g, "''");
}

function arrayLiteral(arr: string[]): string {
  return `['${arr.map(escapeStr).join("', '")}']`;
}

async function seed() {
  // Ensure data directory exists
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.dirname(DB_PATH);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Delete existing DB file so we start fresh
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log(`Removed existing database: ${DB_PATH}`);
  }

  const instance = await DuckDBInstance.create(DB_PATH);
  const conn = await instance.connect();

  console.log("Creating schema...");
  await conn.run(SCHEMA_SQL);

  // --- Project Summary ---
  console.log("Seeding project_summary...");
  await conn.run(`
    INSERT INTO project_summary (id, name, framework, directories, auth, database_info)
    VALUES (1, '${escapeStr(PROJECT_SUMMARY.name)}', '${escapeStr(PROJECT_SUMMARY.framework)}',
      ${arrayLiteral(PROJECT_SUMMARY.directories)},
      '${escapeStr(PROJECT_SUMMARY.auth)}', '${escapeStr(PROJECT_SUMMARY.database)}')
  `);

  // --- File Tree (stored as JSON) ---
  console.log("Seeding file_tree...");
  await conn.run(`
    INSERT INTO file_tree (id, tree_json)
    VALUES (1, '${escapeStr(JSON.stringify(FILE_TREE))}')
  `);

  // --- Routes ---
  console.log("Seeding routes...");
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    await conn.run(`
      INSERT INTO routes (id, path, title, auth_required, description)
      VALUES (${i + 1}, '${escapeStr(r.path)}', '${escapeStr(r.title)}', ${r.authRequired}, '${escapeStr(r.description)}')
    `);
  }

  // --- User Flows ---
  console.log("Seeding user_flows...");
  for (const f of USER_FLOWS) {
    await conn.run(`
      INSERT INTO user_flows (id, name, steps)
      VALUES ('${escapeStr(f.id)}', '${escapeStr(f.name)}', ${arrayLiteral(f.steps)})
    `);
  }

  // --- Mock Data Entities ---
  console.log("Seeding mock_data_entities...");
  for (let i = 0; i < MOCK_DATA_ENTITIES.length; i++) {
    const e = MOCK_DATA_ENTITIES[i];
    await conn.run(`
      INSERT INTO mock_data_entities (id, name, count, note)
      VALUES (${i + 1}, '${escapeStr(e.name)}', ${e.count}, '${escapeStr(e.note)}')
    `);
  }

  // --- Auth Overrides ---
  console.log("Seeding auth_overrides...");
  for (const a of AUTH_OVERRIDES) {
    await conn.run(`
      INSERT INTO auth_overrides (id, label, enabled)
      VALUES ('${escapeStr(a.id)}', '${escapeStr(a.label)}', ${a.enabled})
    `);
  }

  // --- Environment Items ---
  console.log("Seeding env_items...");
  for (const e of ENV_ITEMS) {
    await conn.run(`
      INSERT INTO env_items (id, label, enabled)
      VALUES ('${escapeStr(e.id)}', '${escapeStr(e.label)}', ${e.enabled})
    `);
  }

  // --- Flow Scripts ---
  console.log("Seeding flow_scripts and script_steps...");
  for (let i = 0; i < FLOW_SCRIPTS.length; i++) {
    const fs = FLOW_SCRIPTS[i];
    await conn.run(`
      INSERT INTO flow_scripts (id, flow_id, flow_name)
      VALUES (${i + 1}, '${escapeStr(fs.flowId)}', '${escapeStr(fs.flowName)}')
    `);
    for (const step of fs.steps) {
      await conn.run(`
        INSERT INTO script_steps (id, flow_id, step_number, url, action, expected_outcome, duration)
        VALUES ('${escapeStr(step.id)}', '${escapeStr(fs.flowId)}', ${step.stepNumber},
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
        INSERT INTO voiceover_scripts (flow_id, paragraph_index, text)
        VALUES ('${escapeStr(flowId)}', ${i}, '${escapeStr(paragraphs[i])}')
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
        INSERT INTO timeline_markers (id, flow_id, timestamp, label, paragraph_index)
        VALUES (${tmId++}, '${escapeStr(flowId)}', '${escapeStr(m.timestamp)}',
          '${escapeStr(m.label)}', ${m.paragraphIndex})
      `);
    }
  }

  // --- Chapter Markers ---
  console.log("Seeding chapter_markers...");
  for (let i = 0; i < CHAPTER_MARKERS.length; i++) {
    const c = CHAPTER_MARKERS[i];
    await conn.run(`
      INSERT INTO chapter_markers (id, flow_name, start_time)
      VALUES (${i + 1}, '${escapeStr(c.flowName)}', '${escapeStr(c.startTime)}')
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
