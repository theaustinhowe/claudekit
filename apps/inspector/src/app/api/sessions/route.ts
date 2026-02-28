import { createSessionPOSTHandler, createSessionsListHandler } from "@claudekit/session/next";
import { listSessions } from "@/lib/actions/sessions";
import { createSession, startSession } from "@/lib/services/session-manager";
import { sessionRunners } from "@/lib/services/session-runners";

export const dynamic = "force-dynamic";

// GET /api/sessions — List sessions with optional filters
export const GET = createSessionsListHandler({
  listSessions,
});

// POST /api/sessions — Create and start a new session
export const POST = createSessionPOSTHandler({
  createSession,
  startSession,
  sessionRunners,
});
