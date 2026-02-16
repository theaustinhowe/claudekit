# @devkit/claude-usage

Shared Claude Code usage tracking — types, pricing, rate limits, session parsing, and UI components.

## Exports

- `@devkit/claude-usage` — types + pricing (safe anywhere, client or server)
- `@devkit/claude-usage/server` — Node.js service functions (server-only)
- `@devkit/claude-usage/components/usage-shared` — React UI components (client)

## API

### Types (from `@devkit/claude-usage`)

- `ClaudeRateLimits` — OAuth rate limit data (5h, 7d, model-specific, extra credits)
- `ClaudeUsageStats` — aggregated usage stats (sessions, messages, tokens, costs)
- `RateLimitWindow` — single utilization window { utilization, resetsAt }
- `TokenCounts` — input/output/cache token counts
- `calculateModelCost(modelId, tokens)` — compute USD cost for token usage

### Server Functions (from `@devkit/claude-usage/server`)

- `getClaudeRateLimits()` — fetch rate limits via OAuth token + API (60s cache)
- `getTodayUsageWithCost()` — parse today's JSONL session files for token costs
- `getRecentDailyCosts(days)` — parse recent days' JSONL files for daily cost totals
- `getClaudeUsageStats()` — read stats-cache.json + enrich with cost data

### Components (from `@devkit/claude-usage/components/usage-shared`)

- `ClaudeUsageDialog` — full usage details dialog (rate limits, stats, costs, model usage)
- `HeaderUsageWidget` — compact header widget showing utilization bar + countdown
