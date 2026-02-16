import type { SessionRunner } from "@/lib/services/session-manager";
import type { SessionType } from "@/lib/types";
import { createAIFileGenRunner } from "./ai-file-gen";
import { createAutoFixRunner } from "./auto-fix";
import { createChatRunner } from "./chat";
import { createCleanupRunner } from "./cleanup";
import { createFindingFixRunner } from "./finding-fix";
import { createFixApplyRunner } from "./fix-apply";
import { createQuickImproveRunner } from "./quick-improve";
import { createScaffoldRunner } from "./scaffold";
import { createScanRunner } from "./scan";
import { createToolboxCommandRunner } from "./toolbox-command";
import { createUpgradeRunner } from "./upgrade";
import { createUpgradeInitRunner } from "./upgrade-init";

type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

export const sessionRunners: Record<SessionType, RunnerFactory> = {
  quick_improve: createQuickImproveRunner,
  finding_fix: createFindingFixRunner,
  chat: createChatRunner,
  scaffold: createScaffoldRunner,
  upgrade: createUpgradeRunner,
  auto_fix: createAutoFixRunner,
  fix_apply: createFixApplyRunner,
  scan: createScanRunner,
  upgrade_init: createUpgradeInitRunner,
  ai_file_gen: createAIFileGenRunner,
  cleanup: createCleanupRunner,
  toolbox_command: createToolboxCommandRunner,
};
