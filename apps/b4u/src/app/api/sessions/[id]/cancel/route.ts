import { createCancelHandler } from "@claudekit/session/next";
import { sessionManager } from "@/lib/claude/session-manager";

export const POST = createCancelHandler({
  manager: sessionManager,
});
