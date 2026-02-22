import { createStreamHandler } from "@claudekit/session/next";
import { getSessionLogsFromDb, getSessionRecord } from "@/lib/actions/sessions";
import { SESSION_HEARTBEAT_INTERVAL_MS } from "@/lib/constants";
import { sessionManager } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

export const GET = createStreamHandler({
  manager: sessionManager,
  replay: {
    getSession: async (id) => (await getSessionRecord(id)) ?? null,
    getLogs: (id, limit) => getSessionLogsFromDb(id, limit ?? 500),
  },
  heartbeatIntervalMs: SESSION_HEARTBEAT_INTERVAL_MS,
});
