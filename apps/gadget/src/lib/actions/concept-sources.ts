"use server";

import { getEncryptionKey } from "@/lib/actions/settings";
import { CLAUDE_CONFIG_SOURCE_ID, CURATED_SOURCE_ID, LIBRARY_REPO_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { execute, queryAll, queryOne, withTransaction } from "@/lib/db/helpers";
import type { DiscoveredConcept } from "@/lib/services/concept-scanner";
import { decrypt } from "@/lib/services/encryption";
import { scanGitHubRepoForConcepts } from "@/lib/services/github-concept-scanner";
import { fetchMcpServerList, getCuratedMcpServers, mcpListEntriesToConcepts } from "@/lib/services/mcp-list-scanner";
import type { ConceptSourceWithStats } from "@/lib/types";
import { generateId, parseGitHubUrl } from "@/lib/utils";

function parseSource(row: ConceptSourceWithStats): ConceptSourceWithStats {
  return {
    ...row,
    concept_count: Number(row.concept_count),
    is_builtin: Boolean(row.is_builtin),
  };
}

export async function getConceptSources(): Promise<ConceptSourceWithStats[]> {
  const db = await getDb();
  const rows = await queryAll<ConceptSourceWithStats>(
    db,
    `SELECT cs.*,
       CAST(COALESCE(cc.cnt, 0) AS INTEGER) as concept_count
     FROM concept_sources cs
     LEFT JOIN (
       SELECT source_id, COUNT(*) as cnt FROM concepts WHERE source_id IS NOT NULL GROUP BY source_id
     ) cc ON cc.source_id = cs.id
     ORDER BY cs.is_builtin DESC, cs.name`,
  );
  return rows.map(parseSource);
}

export async function createGitHubSource(opts: {
  github_url: string;
  github_account_id?: string;
  name?: string;
}): Promise<{ success: boolean; message: string; sourceId?: string }> {
  const parsed = parseGitHubUrl(opts.github_url);
  if (!parsed) return { success: false, message: "Invalid GitHub URL" };

  const db = await getDb();
  const id = generateId();
  const name = opts.name || `${parsed.owner}/${parsed.repo}`;

  await execute(
    db,
    `INSERT INTO concept_sources (id, source_type, name, github_owner, github_repo, github_url, github_default_branch)
     VALUES (?, 'github_repo', ?, ?, ?, ?, 'main')`,
    [id, name, parsed.owner, parsed.repo, opts.github_url],
  );

  return { success: true, message: `Added GitHub source: ${name}`, sourceId: id };
}

export async function createMcpListSource(opts: {
  name: string;
  list_url: string;
  description?: string;
}): Promise<{ success: boolean; message: string; sourceId?: string }> {
  const db = await getDb();
  const id = generateId();

  await execute(
    db,
    `INSERT INTO concept_sources (id, source_type, name, description, list_url)
     VALUES (?, 'mcp_list', ?, ?, ?)`,
    [id, opts.name, opts.description || null, opts.list_url],
  );

  return { success: true, message: `Added MCP list source: ${opts.name}`, sourceId: id };
}

export async function deleteConceptSource(id: string): Promise<{ success: boolean; message: string }> {
  if (id === CURATED_SOURCE_ID || id === CLAUDE_CONFIG_SOURCE_ID) {
    return { success: false, message: "Cannot delete built-in source" };
  }

  const db = await getDb();
  try {
    await withTransaction(db, async () => {
      await execute(db, "DELETE FROM concept_links WHERE concept_id IN (SELECT id FROM concepts WHERE source_id = ?)", [
        id,
      ]);
      await execute(db, "DELETE FROM concepts WHERE source_id = ?", [id]);
      await execute(db, "DELETE FROM concept_sources WHERE id = ?", [id]);
    });
    return { success: true, message: "Source deleted" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Delete failed" };
  }
}

/** Get a decrypted PAT from the default GitHub account, .env.local, or first available account */
async function getDefaultPat(): Promise<string | null> {
  const db = await getDb();
  const account = await queryOne<{ pat_encrypted: string }>(
    db,
    "SELECT pat_encrypted FROM github_accounts WHERE is_default = true LIMIT 1",
  );
  if (!account) {
    const fallback = await queryOne<{ pat_encrypted: string }>(db, "SELECT pat_encrypted FROM github_accounts LIMIT 1");
    if (!fallback) {
      // Fall back to .env.local GITHUB_TOKEN (with GITHUB_PERSONAL_ACCESS_TOKEN compat)
      const { readEnvLocal } = await import("@/lib/actions/env-keys");
      const env = await readEnvLocal();
      const token = env.GITHUB_TOKEN ?? env.GITHUB_PERSONAL_ACCESS_TOKEN;
      return token?.length > 0 ? token : null;
    }
    const key = await getEncryptionKey();
    if (!key) return null;
    return decrypt(fallback.pat_encrypted, key);
  }
  const key = await getEncryptionKey();
  if (!key) return null;
  return decrypt(account.pat_encrypted, key);
}

export async function scanConceptSource(
  sourceId: string,
): Promise<{ success: boolean; message: string; count?: number }> {
  const db = await getDb();
  const source = await queryOne<{
    id: string;
    source_type: string;
    github_owner: string | null;
    github_repo: string | null;
    github_default_branch: string | null;
    list_url: string | null;
    last_scanned_at: string | null;
  }>(db, "SELECT * FROM concept_sources WHERE id = ?", [sourceId]);

  if (!source) return { success: false, message: "Source not found" };

  try {
    let discovered: DiscoveredConcept[] = [];

    if (source.source_type === "github_repo") {
      if (!source.github_owner || !source.github_repo) {
        return { success: false, message: "Missing GitHub owner/repo" };
      }
      const pat = await getDefaultPat();
      if (!pat) return { success: false, message: "No GitHub PAT configured. Add a GitHub account first." };

      discovered = await scanGitHubRepoForConcepts(
        pat,
        source.github_owner,
        source.github_repo,
        source.github_default_branch || "main",
      );
    } else if (source.source_type === "mcp_list") {
      if (!source.list_url) return { success: false, message: "No list URL configured" };
      const list = await fetchMcpServerList(source.list_url);
      discovered = mcpListEntriesToConcepts(list.servers);
    } else if (source.source_type === "curated") {
      const servers = getCuratedMcpServers();
      discovered = mcpListEntriesToConcepts(servers);
    } else if (source.source_type === "claude_config") {
      const { discoverClaudeConfigConcepts } = await import("@/lib/services/claude-config-scanner");
      discovered = discoverClaudeConfigConcepts();
    } else {
      return { success: false, message: `Cannot scan source type: ${source.source_type}` };
    }

    await storeSourceConcepts(LIBRARY_REPO_ID, sourceId, discovered);

    await execute(
      db,
      "UPDATE concept_sources SET last_scanned_at = CAST(current_timestamp AS VARCHAR), updated_at = CAST(current_timestamp AS VARCHAR) WHERE id = ?",
      [sourceId],
    );

    return { success: true, message: `Discovered ${discovered.length} concepts`, count: discovered.length };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Scan failed" };
  }
}

export async function refreshAllSources(): Promise<{ success: boolean; message: string }> {
  const sources = await getConceptSources();

  const results: PromiseSettledResult<{ success: boolean; message: string; count?: number }>[] = [];
  for (const source of sources) {
    try {
      const value = await scanConceptSource(source.id);
      results.push({ status: "fulfilled", value });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  let successCount = 0;
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.success) {
      successCount++;
    } else {
      const msg =
        result.status === "fulfilled"
          ? result.value.message
          : result.reason instanceof Error
            ? result.reason.message
            : "Scan failed";
      failures.push(`${sources[i].name}: ${msg}`);
    }
  }

  const message =
    failures.length > 0
      ? `Scanned ${successCount} source${successCount !== 1 ? "s" : ""}, ${failures.length} failed — ${failures.join("; ")}`
      : `Scanned ${successCount} source${successCount !== 1 ? "s" : ""} successfully`;

  return { success: failures.length === 0, message };
}

/**
 * Store concepts from a source into the DB.
 * Uses name as the key since many source concepts share the same relative_path (.mcp.json).
 */
async function storeSourceConcepts(repoId: string, sourceId: string, discovered: DiscoveredConcept[]): Promise<void> {
  const db = await getDb();

  await withTransaction(db, async () => {
    const existing = await queryAll<{ id: string; name: string; content: string | null }>(
      db,
      "SELECT id, name, content FROM concepts WHERE source_id = ?",
      [sourceId],
    );
    const existingByName = new Map(existing.map((e) => [e.name, e]));
    const discoveredNames = new Set(discovered.map((d) => d.name));

    for (const concept of discovered) {
      const match = existingByName.get(concept.name);
      if (match) {
        const contentChanged = match.content !== concept.content;
        await execute(
          db,
          `UPDATE concepts SET concept_type = ?, description = ?,
           relative_path = ?, content = ?, metadata = ?,
           updated_at = CAST(current_timestamp AS VARCHAR)
           WHERE id = ?`,
          [
            concept.concept_type,
            concept.description,
            concept.relative_path,
            concept.content,
            JSON.stringify(concept.metadata),
            match.id,
          ],
        );
        if (contentChanged) {
          await execute(
            db,
            "UPDATE concept_links SET sync_status = 'stale' WHERE concept_id = ? AND sync_status = 'synced'",
            [match.id],
          );
        }
      } else {
        const now = new Date().toISOString();
        await execute(
          db,
          `INSERT INTO concepts (id, repo_id, source_id, concept_type, name, description, relative_path, content, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (repo_id, relative_path) DO UPDATE SET
             source_id = EXCLUDED.source_id, concept_type = EXCLUDED.concept_type,
             name = EXCLUDED.name, description = EXCLUDED.description,
             content = EXCLUDED.content, metadata = EXCLUDED.metadata,
             updated_at = ?`,
          [
            generateId(),
            repoId,
            sourceId,
            concept.concept_type,
            concept.name,
            concept.description,
            concept.relative_path,
            concept.content,
            JSON.stringify(concept.metadata),
            now,
          ],
        );
      }
    }

    for (const [name, ex] of existingByName) {
      if (!discoveredNames.has(name)) {
        await execute(db, "DELETE FROM concept_links WHERE concept_id = ?", [ex.id]);
        await execute(db, "DELETE FROM concepts WHERE id = ?", [ex.id]);
      }
    }
  });
}
