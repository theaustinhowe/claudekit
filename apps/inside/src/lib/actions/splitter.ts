"use server";

import crypto from "node:crypto";
import { runClaude } from "@devkit/claude-runner";
import { fetchPRDiff } from "@/lib/actions/github";
import { execute, getDb, queryOne } from "@/lib/db";
import { buildSplitPlanPrompt } from "@/lib/prompts";

export async function startSplitAnalysis(prId: string) {
  const db = await getDb();

  const pr = await queryOne<{
    id: string;
    repo_id: string;
    number: number;
    title: string;
    files_changed: number;
    lines_added: number;
    lines_deleted: number;
  }>(db, "SELECT id, repo_id, number, title, files_changed, lines_added, lines_deleted FROM prs WHERE id = ?", [prId]);

  if (!pr) throw new Error(`PR not found: ${prId}`);

  const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
    pr.repo_id,
  ]);
  if (!repo) throw new Error(`Repo not found: ${pr.repo_id}`);

  // Fetch the diff from GitHub
  const diff = await fetchPRDiff(repo.owner, repo.name, pr.number);

  const prompt = buildSplitPlanPrompt({
    number: pr.number,
    title: pr.title,
    filesChanged: pr.files_changed,
    diff,
  });

  const result = await runClaude({
    prompt,
    cwd: process.cwd(),
    allowedTools: "",
    onProgress: () => {},
  });

  // Parse JSON from response
  const responseText = result.stdout || "";
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse split plan response");
  }

  const subPRs = JSON.parse(jsonMatch[0]);

  // Persist
  const planId = crypto.randomUUID();
  const totalLines = pr.lines_added + pr.lines_deleted;

  await execute(
    db,
    "INSERT INTO split_plans (id, pr_id, total_lines, sub_prs, created_at) VALUES (?, ?, ?, ?, current_timestamp)",
    [planId, prId, totalLines, JSON.stringify(subPRs)],
  );

  return planId;
}

export async function getSplitPlan(planId: string) {
  const db = await getDb();
  const plan = await queryOne<{
    id: string;
    pr_id: string;
    total_lines: number;
    sub_prs: string;
    created_at: string;
  }>(db, "SELECT * FROM split_plans WHERE id = ?", [planId]);

  if (!plan) return null;

  const pr = await queryOne<{ number: number; title: string }>(db, "SELECT number, title FROM prs WHERE id = ?", [
    plan.pr_id,
  ]);

  return {
    ...plan,
    prNumber: pr?.number ?? 0,
    prTitle: pr?.title ?? "",
    subPRs: JSON.parse(plan.sub_prs),
  };
}

export async function getSplitPlansForPR(prId: string) {
  const db = await getDb();
  return queryOne<{
    id: string;
    total_lines: number;
    sub_prs: string;
    created_at: string;
  }>(db, "SELECT * FROM split_plans WHERE pr_id = ? ORDER BY created_at DESC LIMIT 1", [prId]);
}
