import { createCancelHandler } from "@claudekit/session/next";
import { sessionManager } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

export const POST = createCancelHandler({
  manager: sessionManager,
});
