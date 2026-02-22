import type { SessionRunner } from "@/lib/services/session-manager";
import type { SessionType } from "@/lib/types";
import { createAIFileGenRunner } from "./ai-file-gen";
import { createCleanupRunner } from "./cleanup";
import { createFindingFixRunner } from "./finding-fix";
import { createFixApplyRunner } from "./fix-apply";
import { createQuickImproveRunner } from "./quick-improve";
import { createScanRunner } from "./scan";
import { createToolboxCommandRunner } from "./toolbox-command";

type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

export const sessionRunners: Record<SessionType, RunnerFactory> = {
  quick_improve: createQuickImproveRunner,
  finding_fix: createFindingFixRunner,
  fix_apply: createFixApplyRunner,
  scan: createScanRunner,
  ai_file_gen: createAIFileGenRunner,
  cleanup: createCleanupRunner,
  toolbox_command: createToolboxCommandRunner,
};
