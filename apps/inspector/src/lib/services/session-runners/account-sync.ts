import type { SessionRunner } from "@/lib/services/session-manager";

export function createAccountSyncRunner(_metadata: Record<string, unknown>): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({
      type: "progress",
      progress: 1,
      phase: "Authenticating",
      log: "[INFO] Checking GitHub authentication...",
      logType: "status",
    });

    const { getDb } = await import("@/lib/db");
    const { execute, queryAll, queryOne } = await import("@claudekit/duckdb");
    const { getOctokit } = await import("@/lib/github");
    const { getAuthenticatedUser } = await import("@/lib/actions/account");
    const { classifyPRSize } = await import("@/lib/constants");

    const user = await getAuthenticatedUser();
    if (!user) throw new Error("No authenticated user — check PAT");

    const octokit = getOctokit();
    const db = await getDb();
    const login = user.login;

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Authenticating",
      log: `[INFO] Authenticated as ${login}`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // --- Phase 2: Paginated search (5–50%) ---
    type UserRelationship = "authored" | "reviewed" | "assigned";
    const seen = new Map<string, UserRelationship>();
    const touchedRepoIds = new Set<string>();
    let reposDiscovered = 0;

    const queries: { q: string; relationship: UserRelationship }[] = [
      { q: `type:pr author:${login}`, relationship: "authored" },
      { q: `type:pr reviewed-by:${login}`, relationship: "reviewed" },
      { q: `type:pr assignee:${login}`, relationship: "assigned" },
    ];

    const progressPerQuery = 15; // ~45% total across 3 queries
    let queryIndex = 0;

    for (const { q, relationship } of queries) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const queryBaseProgress = 5 + queryIndex * progressPerQuery;

      onProgress({
        type: "progress",
        progress: queryBaseProgress,
        phase: "Searching PRs",
        log: `[INFO] Searching: ${relationship} PRs...`,
        logType: "status",
      });

      try {
        let page = 1;
        let totalCount = 0;
        let fetched = 0;

        while (true) {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");

          const results = await octokit.rest.search.issuesAndPullRequests({
            q,
            sort: "updated",
            order: "desc",
            per_page: 100,
            page,
          });

          if (page === 1) {
            totalCount = results.data.total_count;
            onProgress({
              type: "progress",
              log: `[INFO] Found ${totalCount} ${relationship} PRs total`,
              logType: "status",
            });
          }

          for (const item of results.data.items) {
            const htmlUrl = item.html_url;
            if (seen.has(htmlUrl)) continue;
            seen.set(htmlUrl, relationship);

            const urlParts = htmlUrl.replace("https://github.com/", "").split("/");
            const owner = urlParts[0];
            const repoName = urlParts[1];
            const prNumber = item.number;
            const repoFullName = `${owner}/${repoName}`;
            const repoId = repoFullName;

            const existingRepo = await queryOne(db, "SELECT id FROM repos WHERE id = ?", [repoId]);
            if (!existingRepo) {
              await execute(
                db,
                `INSERT INTO repos (id, owner, name, full_name, default_branch, last_synced_at, created_at)
                 VALUES (?, ?, ?, ?, 'main', now(), now())`,
                [repoId, owner, repoName, repoFullName],
              );
              reposDiscovered++;
            }

            touchedRepoIds.add(repoId);

            const prId = `${repoId}#${prNumber}`;
            const size = classifyPRSize(0);

            let reviewStatus = "Pending";
            if (item.state === "closed" && item.pull_request?.merged_at) {
              reviewStatus = "Merged";
            } else if (item.draft) {
              reviewStatus = "Draft";
            }

            await execute(
              db,
              `INSERT INTO prs (id, repo_id, number, title, author, author_avatar, branch, size, lines_added, lines_deleted, files_changed, review_status, state, github_created_at, github_updated_at, fetched_at, user_relationship, html_url, repo_full_name)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, ?, ?, ?, now(), ?, ?, ?)
               ON CONFLICT (repo_id, number) DO UPDATE SET
                 title = excluded.title,
                 review_status = COALESCE(prs.review_status, excluded.review_status),
                 state = excluded.state,
                 github_updated_at = excluded.github_updated_at,
                 user_relationship = COALESCE(excluded.user_relationship, prs.user_relationship),
                 html_url = COALESCE(excluded.html_url, prs.html_url),
                 repo_full_name = COALESCE(excluded.repo_full_name, prs.repo_full_name),
                 fetched_at = now()`,
              [
                prId,
                repoId,
                prNumber,
                item.title,
                item.user?.login ?? "unknown",
                item.user?.avatar_url ?? null,
                size,
                reviewStatus,
                item.state,
                item.created_at,
                item.updated_at,
                relationship,
                htmlUrl,
                repoFullName,
              ],
            );
          }

          fetched += results.data.items.length;

          // GitHub Search API returns max 1000 results
          if (results.data.items.length < 100 || fetched >= Math.min(totalCount, 1000)) {
            break;
          }

          page++;

          // Emit per-page progress
          const pageProgress = Math.min(fetched / Math.min(totalCount, 1000), 1);
          onProgress({
            type: "progress",
            progress: Math.round(queryBaseProgress + pageProgress * progressPerQuery),
            phase: "Searching PRs",
            log: `[INFO] ${relationship}: fetched ${fetched}/${Math.min(totalCount, 1000)} PRs (page ${page - 1})`,
            logType: "status",
          });
        }

        onProgress({
          type: "progress",
          log: `[INFO] ${relationship}: ${fetched} PRs fetched`,
          logType: "status",
        });
      } catch (err) {
        onProgress({
          type: "progress",
          log: `[WARN] ${relationship} search failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          logType: "warning",
        });
      }

      queryIndex++;
    }

    onProgress({
      type: "progress",
      progress: 50,
      phase: "Enriching PRs",
      log: `[INFO] Search complete — ${seen.size} unique PRs found across ${reposDiscovered} new repos`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // --- Phase 3: Enrich PRs (50–95%) ---
    const prsToEnrich = await queryAll<{ id: string; repo_id: string; number: number }>(
      db,
      `SELECT id, repo_id, number FROM prs
       WHERE lines_added = 0 AND lines_deleted = 0 AND user_relationship IS NOT NULL
       ORDER BY (CASE WHEN state = 'open' THEN 0 ELSE 1 END), github_updated_at DESC
       LIMIT 200`,
    );

    if (prsToEnrich.length > 0) {
      onProgress({
        type: "progress",
        progress: 50,
        phase: "Enriching PRs",
        log: `[INFO] Enriching ${prsToEnrich.length} PRs with line counts...`,
        logType: "status",
      });
    }

    let enriched = 0;
    const enrichTotal = prsToEnrich.length;

    for (const pr of prsToEnrich) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      try {
        const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
          pr.repo_id,
        ]);
        if (!repo) continue;

        const { data: fullPR } = await octokit.rest.pulls.get({
          owner: repo.owner,
          repo: repo.name,
          pull_number: pr.number,
        });

        const linesAdded = fullPR.additions ?? 0;
        const linesDeleted = fullPR.deletions ?? 0;
        const size = classifyPRSize(linesAdded + linesDeleted);

        await execute(
          db,
          `UPDATE prs SET
             lines_added = ?, lines_deleted = ?, files_changed = ?,
             size = ?, branch = ?, author_avatar = ?
           WHERE id = ?`,
          [
            linesAdded,
            linesDeleted,
            fullPR.changed_files ?? 0,
            size,
            fullPR.head?.ref ?? null,
            fullPR.user?.avatar_url ?? null,
            pr.id,
          ],
        );
      } catch {
        // Skip PRs we can't access
      }

      enriched++;

      // Emit progress every 10 PRs
      if (enriched % 10 === 0 || enriched === enrichTotal) {
        const enrichProgress = 50 + Math.round((enriched / Math.max(enrichTotal, 1)) * 45);
        onProgress({
          type: "progress",
          progress: enrichProgress,
          phase: "Enriching PRs",
          log: `[INFO] Enriched ${enriched}/${enrichTotal} PRs`,
          logType: "status",
        });
      }
    }

    // Update last_synced_at for all touched repos
    for (const rid of touchedRepoIds) {
      await execute(db, "UPDATE repos SET last_synced_at = now() WHERE id = ?", [rid]);
    }

    // --- Phase 4: Done ---
    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Account sync complete — ${seen.size} PRs synced, ${reposDiscovered} new repos discovered`,
      logType: "status",
    });

    return { result: { totalSynced: seen.size, reposDiscovered } };
  };
}
