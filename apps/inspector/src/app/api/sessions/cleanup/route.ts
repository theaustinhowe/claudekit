import { createCleanupHandler } from "@claudekit/session/next";
import { listSessions } from "@/lib/actions/sessions";
import { sessionManager } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

export const { GET, POST } = createCleanupHandler({ listSessions, manager: sessionManager });
