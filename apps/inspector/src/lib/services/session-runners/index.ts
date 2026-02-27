import type { SessionRunner } from "@/lib/services/session-manager";
import type { SessionType } from "@/lib/types";
import { createAccountSyncRunner } from "./account-sync";
import { createCommentFixRunner } from "./comment-fix";
import { createSkillAnalysisRunner } from "./skill-analysis";
import { createSplitAnalysisRunner } from "./split-analysis";

type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

// Lazy imports for runners that depend on git-operations (avoid bundling issues)
const lazyRunners: Partial<Record<SessionType, () => Promise<RunnerFactory>>> = {
  skill_rule_analysis: async () => {
    const { createSkillRuleAnalysisRunner } = await import("./skill-rule-analysis");
    return createSkillRuleAnalysisRunner;
  },
  split_execution: async () => {
    const { createSplitExecutionRunner } = await import("./split-execution");
    return createSplitExecutionRunner;
  },
  fix_execution: async () => {
    const { createFixExecutionRunner } = await import("./fix-execution");
    return createFixExecutionRunner;
  },
};

export const sessionRunners: Record<SessionType, RunnerFactory> = {
  skill_analysis: createSkillAnalysisRunner,
  split_analysis: createSplitAnalysisRunner,
  comment_fix: createCommentFixRunner,
  // Placeholder entries that will be replaced by lazy loading
  skill_rule_analysis: (metadata, contextId) => {
    return async (opts) => {
      const loader = lazyRunners.skill_rule_analysis;
      if (!loader) throw new Error("skill_rule_analysis runner not configured");
      const factory = await loader();
      return factory(metadata, contextId)(opts);
    };
  },
  split_execution: (metadata, contextId) => {
    return async (opts) => {
      const loader = lazyRunners.split_execution;
      if (!loader) throw new Error("split_execution runner not configured");
      const factory = await loader();
      return factory(metadata, contextId)(opts);
    };
  },
  fix_execution: (metadata, contextId) => {
    return async (opts) => {
      const loader = lazyRunners.fix_execution;
      if (!loader) throw new Error("fix_execution runner not configured");
      const factory = await loader();
      return factory(metadata, contextId)(opts);
    };
  },
  account_sync: createAccountSyncRunner,
};
