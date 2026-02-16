# @devkit/session

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

### SessionRunner Signature

```typescript
type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: unknown }>;
```

### SessionEvent Types

`init | progress | log | chunk | done | error | cancelled | heartbeat`
