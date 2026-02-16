import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ClaudeRateLimits, RateLimitWindow } from "./types";

const execFileAsync = promisify(execFile);

// Module-level cache (same pattern as claude-session-parser.ts)
let cachedLimits: ClaudeRateLimits | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken?: string;
  };
}

interface RawWindow {
  utilization?: number;
  resets_at?: string | null;
}

interface OAuthUsageResponse {
  five_hour?: RawWindow;
  seven_day?: RawWindow;
  // Model-specific weekly limits use the pattern "seven_day_{model}"
  seven_day_opus?: RawWindow | null;
  seven_day_sonnet?: RawWindow | null;
  seven_day_oauth_apps?: RawWindow | null;
  extra_usage?: {
    is_enabled?: boolean;
    utilization?: number;
    used_credits?: number;
    monthly_limit?: number;
  };
  // Catch-all for unknown/future model-specific fields
  [key: string]: unknown;
}

function parseWindow(raw?: RawWindow | null): RateLimitWindow | null {
  if (!raw || raw.utilization == null) return null;
  return {
    utilization: raw.utilization,
    resetsAt: raw.resets_at ?? "",
  };
}

/** Read the OAuth access token from macOS Keychain, falling back to ~/.claude/.credentials.json */
async function getOAuthToken(): Promise<string | null> {
  // macOS: credentials are stored in the system keychain
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ]);
      const raw = stdout.trim();
      if (raw) {
        const creds: OAuthCredentials = JSON.parse(raw);
        if (creds.claudeAiOauth?.accessToken) {
          return creds.claudeAiOauth.accessToken;
        }
      }
    } catch {
      // Keychain not available or entry not found — fall through to file
    }
  }

  // Linux / fallback: read from credentials file
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const raw = await readFile(credPath, "utf-8");
    const creds: OAuthCredentials = JSON.parse(raw);
    return creds.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Fetch rate limits from the Anthropic OAuth usage API */
async function fetchRateLimits(token: string): Promise<ClaudeRateLimits> {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`OAuth usage API returned ${res.status}`);
  }

  const data = (await res.json()) as OAuthUsageResponse;

  // Extract model-specific weekly limits (seven_day_opus, seven_day_sonnet, etc.)
  const modelLimits: Record<string, RateLimitWindow> = {};
  const MODEL_PREFIX = "seven_day_";
  const SKIP_KEYS = new Set(["seven_day", "seven_day_oauth_apps", "seven_day_cowork"]);
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(MODEL_PREFIX) || SKIP_KEYS.has(key)) continue;
    const modelName = key.slice(MODEL_PREFIX.length);
    const window = parseWindow(value as RawWindow | null);
    if (window) {
      modelLimits[modelName] = window;
    }
  }

  return {
    fiveHour: parseWindow(data.five_hour) ?? { utilization: 0, resetsAt: "" },
    sevenDay: parseWindow(data.seven_day) ?? { utilization: 0, resetsAt: "" },
    modelLimits,
    extraUsage: data.extra_usage?.is_enabled
      ? {
          isEnabled: true,
          utilization:
            data.extra_usage.utilization ??
            (data.extra_usage.monthly_limit
              ? ((data.extra_usage.used_credits ?? 0) / data.extra_usage.monthly_limit) * 100
              : 0),
          usedCredits: data.extra_usage.used_credits ?? 0,
          monthlyLimit: data.extra_usage.monthly_limit ?? 0,
        }
      : null,
  };
}

/** Get Claude rate limits with 60s cache. Returns null if no OAuth token or API error. */
export async function getClaudeRateLimits(): Promise<ClaudeRateLimits | null> {
  const now = Date.now();
  if (cachedLimits && now - cachedAt < CACHE_TTL_MS) {
    return cachedLimits;
  }

  try {
    const token = await getOAuthToken();
    if (!token) return null;

    cachedLimits = await fetchRateLimits(token);
    cachedAt = Date.now();
    return cachedLimits;
  } catch {
    return null;
  }
}
