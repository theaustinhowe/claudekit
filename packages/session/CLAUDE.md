# @claudekit/session

Unified session lifecycle manager for long-running operations. Uses dependency injection — apps provide their own DB persistence callbacks.

## API

- `createSessionManager(config)` — factory returning `SessionManager`
  - `persistence`: `{ loadSession, updateSession, persistLogs }` callbacks
  - `eventBufferSize`: ring buffer size (default: 500)
  - `logFlushIntervalMs`: batch flush interval (default: 2000)
  - `useGlobalCache`: survive Next.js HMR (default: true)

### SessionManager Methods

- `startSession(id, runner)` — start a session with a runner function
- `cancelSession(id)` — abort a running session (kills PID if orphaned)
- `subscribe(id, callback)` — subscribe to events (replays buffered events)
- `getLiveSession(id)` — get in-memory session state
- `setCleanupFn(id, fn)` — register cleanup on cancel/error
- `setSessionPid(id, pid)` — track CLI process PID
- `emitEvent(id, event)` — emit an event into a live session from external code (ring buffer + fan-out + log batching)

### SessionRunner Signature

```typescript
type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: Record<string, unknown> }>;
```

### SessionEvent Types

`init | progress | log | chunk | done | error | cancelled | heartbeat`

### SSE Response Helper

- `createSessionSSEResponse(opts)` — create a streaming SSE `Response` for a session
  - Subscribes to live sessions or replays from DB for completed ones
  - Handles heartbeat, client disconnect cleanup, and terminal events

### DB Init Helper

- `reconcileSessionsOnInit(exec)` — reconcile orphaned sessions and prune old data on app startup
  - Marks orphaned running/pending sessions as error
  - Prunes session logs older than 7 days
  - Prunes completed sessions older than 30 days

### Exported Constants

- `SESSION_EVENT_BUFFER_SIZE` — default ring buffer size (500)
- `SESSION_LOG_FLUSH_INTERVAL_MS` — default batch flush interval (2000ms)
- `SESSION_HEARTBEAT_INTERVAL_MS` — default heartbeat interval (15000ms)

### Next.js Route Handlers (`@claudekit/session/next`)

Subpath export with pre-built Next.js App Router handlers:

- `createStreamHandler(opts)` — GET handler for session SSE streaming
- `createCancelHandler(opts)` — POST handler for session cancellation
- `createCleanupHandler(opts)` — GET + POST handlers for bulk session cleanup
- `createSessionPOSTHandler(opts)` — POST handler for creating and starting a session
- `createSessionsListHandler(opts)` — GET handler for listing sessions with filters
