"use server";

import { execute, getDb, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createSplitAnalysisRunner } from "@/lib/services/session-runners/split-analysis";

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
