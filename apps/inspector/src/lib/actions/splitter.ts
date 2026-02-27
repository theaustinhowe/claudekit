"use server";

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createSplitAnalysisRunner } from "@/lib/services/session-runners/split-analysis";
import type { SplitExecution, SplitExecutionStatus } from "@/lib/types";

const log = createServiceLogger("splitter");

export async function startSplitAnalysis(prId: string): Promise<string> {
  log.info({ prId }, "Starting split analysis session");

  const metadata = { prId };
  const sessionId = await createSession({
    sessionType: "split_analysis",
    label: `Split analysis for ${prId}`,
    contextId: prId,
    metadata,
  });

  const runner = createSplitAnalysisRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
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
    subPRs: typeof plan.sub_prs === "string" ? JSON.parse(plan.sub_prs) : plan.sub_prs,
  };
}

export async function updateSubPRDescription(planId: string, subPRIndex: number, description: string) {
  const db = await getDb();
  const plan = await queryOne<{ sub_prs: string }>(db, "SELECT sub_prs FROM split_plans WHERE id = ?", [planId]);
  if (!plan) throw new Error("Plan not found");

  const subPRs = typeof plan.sub_prs === "string" ? JSON.parse(plan.sub_prs) : plan.sub_prs;
  const target = subPRs.find((sp: { index: number }) => sp.index === subPRIndex);
  if (target) {
    target.description = description;
    await execute(db, "UPDATE split_plans SET sub_prs = ? WHERE id = ?", [JSON.stringify(subPRs), planId]);
  }
}

export async function startSplitExecution(planId: string): Promise<string> {
  log.info({ planId }, "Starting split execution session");

  const { createSplitExecutionRunner } = await import("@/lib/services/session-runners/split-execution");

  const metadata = { planId };
  const sessionId = await createSession({
    sessionType: "split_execution",
    label: `Executing split for plan ${planId}`,
    contextId: planId,
    metadata,
  });

  const runner = createSplitExecutionRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function getSplitExecutionStatus(planId: string): Promise<SplitExecution[]> {
  const db = await getDb();
  const rows = await queryAll<{
    id: string;
    plan_id: string;
    sub_pr_index: number;
    status: string;
    branch_name: string | null;
    pr_number: number | null;
    pr_url: string | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>(db, "SELECT * FROM split_executions WHERE plan_id = ? ORDER BY sub_pr_index ASC", [planId]);

  return rows.map((r) => ({
    id: r.id,
    planId: r.plan_id,
    subPRIndex: r.sub_pr_index,
    status: r.status as SplitExecutionStatus,
    branchName: r.branch_name,
    prNumber: r.pr_number,
    prUrl: r.pr_url,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));
}
