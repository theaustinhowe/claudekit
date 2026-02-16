import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { agentsRouter } from "./api/agents.js";
import { healthRouter } from "./api/health.js";
import { issuesRouter } from "./api/issues.js";
import { jobsRouter } from "./api/jobs.js";
import { repositoriesRouter } from "./api/repositories.js";
import { researchRouter } from "./api/research.js";
import { settingsRouter } from "./api/settings.js";
import { setupRouter } from "./api/setup.js";
import { systemRouter } from "./api/system.js";
import { worktreesRouter } from "./api/worktrees.js";
import { authHook } from "./middleware/auth.js";
import { logger } from "./utils/logger.js";
import { setupWebSocket } from "./ws/handler.js";

export async function createServer() {
  const app = Fastify({ loggerInstance: logger.child({ service: "http" }) });

  // DuckDB's @duckdb/node-api can return INTEGER columns as BigInt.
  // JSON.stringify cannot serialize BigInt, so convert them to Number.
  app.setReplySerializer((payload) => {
    return JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? Number(value) : value));
  });

  // SECURITY: Restrict CORS to known local origins instead of allowing all origins.
  // This is a local-only application, but permissive CORS allows any website
  // to make requests to the orchestrator API when it's running.
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:2200", "http://127.0.0.1:2200", "http://localhost:3000", "http://127.0.0.1:3000"];
  await app.register(cors, {
    origin: allowedOrigins,
  });
  await app.register(websocket);

  // API authentication (bearer token)
  app.addHook("onRequest", authHook);

  // REST API routes
  await app.register(agentsRouter, { prefix: "/api/agents" });
  await app.register(healthRouter, { prefix: "/api/health" });
  await app.register(issuesRouter, { prefix: "/api/repositories" });
  await app.register(jobsRouter, { prefix: "/api/jobs" });
  await app.register(repositoriesRouter, { prefix: "/api/repositories" });
  await app.register(researchRouter, { prefix: "/api/research" });
  await app.register(settingsRouter, { prefix: "/api/settings" });
  await app.register(setupRouter, { prefix: "/api/setup" });
  await app.register(systemRouter, { prefix: "/api/system" });
  await app.register(worktreesRouter, { prefix: "/api/worktrees" });

  // WebSocket endpoint
  app.register(async (fastify) => {
    fastify.get("/ws", { websocket: true }, setupWebSocket);
  });

  return app;
}
