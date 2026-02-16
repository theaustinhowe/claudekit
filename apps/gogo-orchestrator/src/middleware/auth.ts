import type { FastifyReply, FastifyRequest } from "fastify";
import { parseJsonField, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbSetting } from "../db/schema.js";

// Cache the token in memory to avoid DB lookup on every request
let cachedToken: string | null = null;
let tokenChecked = false;

async function getApiToken(): Promise<string | null> {
  if (tokenChecked) return cachedToken;

  try {
    const conn = getConn();
    const row = await queryOne<DbSetting>(
      conn,
      "SELECT * FROM settings WHERE key = ?",
      ["api_token"],
    );

    cachedToken = row
      ? String(parseJsonField(row.value, null))
      : process.env.API_TOKEN || null;
  } catch {
    // DB might not be initialized yet during startup
    cachedToken = process.env.API_TOKEN || null;
  }

  tokenChecked = true;
  return cachedToken;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/api/health", "/api/setup"];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((route) => url.startsWith(route));
}

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Skip auth for WebSocket upgrades (handled separately)
  if (request.headers.upgrade === "websocket") return;

  // Skip auth for public routes
  if (isPublicRoute(request.url)) return;

  const token = await getApiToken();

  // If no token is configured, skip auth (fresh install, allow setup flow)
  if (!token) return;

  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Authentication required" });
  }

  const providedToken = authHeader.slice(7); // Remove "Bearer " prefix
  if (providedToken !== token) {
    return reply.status(401).send({ error: "Invalid token" });
  }
}
