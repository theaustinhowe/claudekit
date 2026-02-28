import { createSessionPOSTHandler, createSessionsListHandler } from "@claudekit/session/next";
import { listSessions } from "@/lib/actions/sessions";
import { createSession, startSession } from "@/lib/services/session-manager";
import { sessionRunners } from "@/lib/services/session-runners";

export const dynamic = "force-dynamic";

// GET /api/sessions — List sessions with optional filters
export const GET = createSessionsListHandler({
  // biome-ignore lint/suspicious/noExplicitAny: bridge between shared and app-specific filter/row types
  listSessions: listSessions as any,
});

// POST /api/sessions — Create and start a new session
export const POST = createSessionPOSTHandler({
  // biome-ignore lint/suspicious/noExplicitAny: bridge between shared string types and app-specific SessionType
  createSession: createSession as any,
  startSession,
  sessionRunners,
});
