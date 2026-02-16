"use server";

import fs from "node:fs";
import path from "node:path";
import { LIBRARY_REPO_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { execute, parseJsonField, queryAll, queryOne } from "@/lib/db/helpers";
import type { Concept, ConceptLinkWithConcept, ConceptWithRepo } from "@/lib/types";
import { generateId } from "@/lib/utils";

function parseConcept(row: Concept): Concept {
  return {
    ...row,
    metadata: parseJsonField(row.metadata, {}),
  };
}

function parseConceptWithRepo(row: ConceptWithRepo): ConceptWithRepo {
  return {
    ...row,
    metadata: parseJsonField(row.metadata, {}),
    link_count: row.link_count !== undefined ? Number(row.link_count) : 0,
    source_id: row.source_id || null,
  };
}

function parseLinkWithConcept(row: ConceptLinkWithConcept): ConceptLinkWithConcept {
  return {
    ...row,
    concept_metadata: parseJsonField(row.concept_metadata, {}),
  };
}

export async function getConceptsForRepo(repoId: string): Promise<Concept[]> {
  const db = await getDb();
  const rows = await queryAll<Concept>(db, "SELECT * FROM concepts WHERE repo_id = ? ORDER BY concept_type, name", [
    repoId,
  ]);
  return rows.map(parseConcept);
}

export async function getAllConcepts(): Promise<ConceptWithRepo[]> {
  const db = await getDb();
  // Deduplicate by (name, concept_type), preferring local repo over library
  const rows = await queryAll<ConceptWithRepo>(
    db,
    `SELECT sub.*,
       (SELECT STRING_AGG(DISTINCT COALESCE(r2.name, 'Library'), ', ')
        FROM concepts c2
        LEFT JOIN repos r2 ON r2.id = c2.repo_id AND r2.id != '${LIBRARY_REPO_ID}'
        WHERE c2.name = sub.name AND c2.concept_type = sub.concept_type
       ) as all_repo_names,
       (SELECT STRING_AGG(DISTINCT c2.repo_id, ',')
        FROM concepts c2
        WHERE c2.name = sub.name AND c2.concept_type = sub.concept_type
       ) as all_repo_ids
     FROM (
       SELECT c.*, COALESCE(r.name, cs.name, 'Library') as repo_name,
         COALESCE(r.local_path, '') as repo_path,
         CAST(COALESCE(lc.cnt, 0) AS INTEGER) as link_count,
         cs.source_type, cs.name as source_name,
         ROW_NUMBER() OVER (
           PARTITION BY c.name, c.concept_type
           ORDER BY CASE WHEN c.repo_id != '${LIBRARY_REPO_ID}' THEN 0 ELSE 1 END, c.created_at
         ) as rn
       FROM concepts c
       LEFT JOIN repos r ON r.id = c.repo_id AND r.id != '${LIBRARY_REPO_ID}'
       LEFT JOIN concept_sources cs ON cs.id = c.source_id
       LEFT JOIN (SELECT concept_id, COUNT(*) as cnt FROM concept_links GROUP BY concept_id) lc ON lc.concept_id = c.id
     ) sub
     WHERE sub.rn = 1
     ORDER BY sub.concept_type, sub.name`,
  );
  return rows.map(parseConceptWithRepo);
}

async function getConceptById(id: string): Promise<ConceptWithRepo | null> {
  const db = await getDb();
  const row = await queryOne<ConceptWithRepo>(
    db,
    `SELECT c.*, COALESCE(r.name, cs.name, 'Library') as repo_name,
       COALESCE(r.local_path, '') as repo_path,
       cs.source_type, cs.name as source_name
     FROM concepts c
     LEFT JOIN repos r ON r.id = c.repo_id AND r.id != '__library__'
     LEFT JOIN concept_sources cs ON cs.id = c.source_id
     WHERE c.id = ?`,
    [id],
  );
  if (!row) return null;
  return parseConceptWithRepo(row);
}

export async function getConceptStats(): Promise<Record<string, number>> {
  const db = await getDb();
  // Deduplicate by (name, concept_type) to match getAllConcepts
  const rows = await queryAll<{ concept_type: string; count: number }>(
    db,
    `SELECT concept_type, CAST(COUNT(*) AS INTEGER) as count FROM (
       SELECT name, concept_type, ROW_NUMBER() OVER (
         PARTITION BY name, concept_type
         ORDER BY CASE WHEN repo_id != '${LIBRARY_REPO_ID}' THEN 0 ELSE 1 END, created_at
       ) as rn
       FROM concepts
     ) sub
     WHERE rn = 1
     GROUP BY concept_type`,
  );
  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.concept_type] = Number(row.count);
  }
  return stats;
}

// --- Link management ---

export async function linkConcept(
  conceptId: string,
  targetRepoId: string,
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();

  const concept = await queryOne<{ id: string; repo_id: string; name: string }>(
    db,
    "SELECT id, repo_id, name FROM concepts WHERE id = ?",
    [conceptId],
  );
  if (!concept) return { success: false, message: "Concept not found" };

  if (concept.repo_id === targetRepoId && concept.repo_id !== LIBRARY_REPO_ID) {
    return { success: false, message: "Cannot link a concept to its origin repo" };
  }

  const targetRepo = await queryOne<{ id: string }>(db, "SELECT id FROM repos WHERE id = ?", [targetRepoId]);
  if (!targetRepo) return { success: false, message: "Target repo not found" };

  await execute(
    db,
    `INSERT INTO concept_links (id, concept_id, repo_id, sync_status)
     VALUES (?, ?, ?, 'pending')
     ON CONFLICT (concept_id, repo_id) DO NOTHING`,
    [generateId(), conceptId, targetRepoId],
  );

  return { success: true, message: `Linked "${concept.name}" to repo` };
}

export async function unlinkConcept(conceptId: string, repoId: string): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  await execute(db, "DELETE FROM concept_links WHERE concept_id = ? AND repo_id = ?", [conceptId, repoId]);
  return { success: true, message: "Unlinked concept" };
}

/**
 * Write concept files to disk for a linked repo.
 */
export async function syncConceptToRepo(
  conceptId: string,
  repoId: string,
): Promise<{ success: boolean; message: string }> {
  const concept = await getConceptById(conceptId);
  if (!concept) return { success: false, message: "Concept not found" };

  const db = await getDb();
  const targetRepo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!targetRepo) return { success: false, message: "Target repo not found" };

  const targetPath = targetRepo.local_path;

  try {
    writeConceptToDisk(concept, targetPath);

    // Update link sync status
    await execute(
      db,
      "UPDATE concept_links SET sync_status = 'synced', synced_at = CAST(current_timestamp AS VARCHAR) WHERE concept_id = ? AND repo_id = ?",
      [conceptId, repoId],
    );

    return { success: true, message: `Synced "${concept.name}" to ${targetPath}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncAllConceptsToRepo(repoId: string): Promise<{ success: number; failed: number }> {
  const links = await getLinkedConceptsForRepo(repoId);
  let success = 0;
  let failed = 0;

  for (const link of links) {
    const result = await syncConceptToRepo(link.concept_id, repoId);
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

export async function getLinkedConceptsForRepo(repoId: string): Promise<ConceptLinkWithConcept[]> {
  const db = await getDb();
  const rows = await queryAll<ConceptLinkWithConcept>(
    db,
    `SELECT cl.*,
       c.name as concept_name,
       c.concept_type,
       c.description as concept_description,
       c.content as concept_content,
       c.relative_path as concept_relative_path,
       c.metadata as concept_metadata,
       c.repo_id as origin_repo_id,
       COALESCE(r.name, cs.name, 'Library') as origin_repo_name,
       COALESCE(r.local_path, '') as origin_repo_path
     FROM concept_links cl
     JOIN concepts c ON c.id = cl.concept_id
     LEFT JOIN repos r ON r.id = c.repo_id AND r.id != '__library__'
     LEFT JOIN concept_sources cs ON cs.id = c.source_id
     WHERE cl.repo_id = ?
     ORDER BY c.concept_type, c.name`,
    [repoId],
  );
  return rows.map(parseLinkWithConcept);
}

// --- Install (backwards-compatible: link + sync) ---

export async function installConcept(
  conceptId: string,
  targetRepoId: string,
): Promise<{ success: boolean; message: string }> {
  const linkResult = await linkConcept(conceptId, targetRepoId);
  if (!linkResult.success) return linkResult;

  return syncConceptToRepo(conceptId, targetRepoId);
}

// --- Internal: write concept files to disk ---

function writeConceptToDisk(concept: ConceptWithRepo, targetPath: string): void {
  switch (concept.concept_type) {
    case "skill":
    case "command":
    case "agent": {
      const fullPath = path.join(targetPath, concept.relative_path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, concept.content || "", "utf-8");
      break;
    }

    case "hook": {
      const settingsPath = path.join(targetPath, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      let settings: Record<string, unknown> = {};
      try {
        const existing = fs.readFileSync(settingsPath, "utf-8");
        settings = JSON.parse(existing);
      } catch {
        /* file doesn't exist or invalid */
      }
      if (!settings.hooks || typeof settings.hooks !== "object") {
        settings.hooks = {};
      }
      const hooks = settings.hooks as Record<string, unknown>;
      const meta = concept.metadata as { hook_name?: string; config?: unknown };
      if (meta.hook_name && meta.config) {
        hooks[meta.hook_name] = meta.config;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      break;
    }

    case "mcp_server": {
      const mcpPath = path.join(targetPath, ".mcp.json");
      let mcpJson: Record<string, unknown> = {};
      try {
        const existing = fs.readFileSync(mcpPath, "utf-8");
        mcpJson = JSON.parse(existing);
      } catch {
        /* file doesn't exist or invalid */
      }
      if (!mcpJson.mcpServers || typeof mcpJson.mcpServers !== "object") {
        mcpJson.mcpServers = {};
      }
      const servers = mcpJson.mcpServers as Record<string, unknown>;
      const meta = concept.metadata as { server_name?: string; config?: unknown };
      if (meta.server_name && meta.config) {
        servers[meta.server_name] = meta.config;
      }
      fs.writeFileSync(mcpPath, JSON.stringify(mcpJson, null, 2), "utf-8");
      break;
    }

    case "plugin": {
      const pluginDir = path.join(targetPath, ".claude-plugin");
      fs.mkdirSync(pluginDir, { recursive: true });
      const pluginPath = path.join(pluginDir, "plugin.json");
      fs.writeFileSync(pluginPath, concept.content || "{}", "utf-8");
      break;
    }
  }
}
