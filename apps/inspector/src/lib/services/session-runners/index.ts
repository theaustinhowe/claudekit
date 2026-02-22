import type { SessionRunner } from "@/lib/services/session-manager";
import type { SessionType } from "@/lib/types";
import { createCommentFixRunner } from "./comment-fix";
import { createSkillAnalysisRunner } from "./skill-analysis";
import { createSplitAnalysisRunner } from "./split-analysis";

type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

export const sessionRunners: Record<SessionType, RunnerFactory> = {
  skill_analysis: createSkillAnalysisRunner,
  split_analysis: createSplitAnalysisRunner,
  comment_fix: createCommentFixRunner,
};
