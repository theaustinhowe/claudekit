# @claudekit/github

GitHub API client wrapper with built-in rate limit tracking and error hierarchy.

## Structure

```
src/
├── index.ts           # Public exports
├── client.ts          # GitHubClient class
├── types.ts           # TypeScript interfaces
├── errors.ts          # Error class hierarchy
├── rate-limits.ts     # Rate limit tracking & throttling
└── *.test.ts          # Tests (50% coverage threshold)
```

## GitHubClient

Wraps Octokit with an `after` hook that auto-updates rate limit state on every response.

```typescript
const client = new GitHubClient({ token });
client.octokit          // Raw Octokit instance for API calls
client.rateLimits       // RateLimitInfo | null
client.shouldThrottle   // { throttle, reason?, delayMs? }
```

## Rate Limiting

In-memory cache keyed by hashed tokens (never stores raw tokens).

- **Warning threshold (20% remaining):** 5000ms delay
- **Critical threshold (10% remaining):** delay until reset, capped at 60000ms
- Headers tracked: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-used`

Standalone functions for multi-token monitoring:
- `getRateLimitInfo(token)` — cached limits for one token
- `shouldThrottleRequests(token)` — check if requests need delay
- `updateRateLimitFromResponse(token, headers)` — manual header parsing
- `getAllRateLimitInfo()` — aggregate across all tokens (`lowestRemaining`, `hasWarning`, `hasCritical`)

## Error Hierarchy

All extend `Error` with descriptive `name` properties:

- `GitHubApiError` — generic, includes optional `statusCode`
- `GitHubAuthError` — authentication failures
- `GitHubRateLimitError` — includes `resetAt: Date` for retry scheduling
- `RepositoryNotFoundError` — repo lookup failures
- `GitHubCredentialsError` — missing token configuration

## Dependencies

- `octokit` ^4.1.2
