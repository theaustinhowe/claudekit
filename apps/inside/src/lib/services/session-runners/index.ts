import type { SessionRunner } from "@/lib/services/session-manager";
import type { SessionType } from "@/lib/types";
import { createAutoFixRunner } from "./auto-fix";
import { createChatRunner } from "./chat";
import { createScaffoldRunner } from "./scaffold";
import { createUpgradeRunner } from "./upgrade";
import { createUpgradeInitRunner } from "./upgrade-init";

type RunnerFactory = (metadata: Record<string, unknown>, contextId?: string) => SessionRunner;

export const sessionRunners: Record<SessionType, RunnerFactory> = {
  scaffold: createScaffoldRunner,
  chat: createChatRunner,
  upgrade: createUpgradeRunner,
  upgrade_init: createUpgradeInitRunner,
  auto_fix: createAutoFixRunner,
};
