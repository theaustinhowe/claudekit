import { createCleanupHandler } from "@claudekit/session/next";
import { listSessions } from "@/lib/actions/sessions";
import { sessionManager } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

// biome-ignore lint/suspicious/noExplicitAny: bridge between shared and app-specific filter/row types
export const { GET, POST } = createCleanupHandler({ listSessions: listSessions as any, manager: sessionManager });
