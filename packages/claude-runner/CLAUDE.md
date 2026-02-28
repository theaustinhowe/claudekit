# @claudekit/claude-runner

Shared Claude CLI runner for spawning Claude Code processes with stream-json output parsing.

## API

### High-Level

- `runClaude(options)` — spawn Claude CLI, accumulate output, returns `Promise<ClaudeResult>`
  - `prompt`: the prompt to send
  - `cwd`: working directory
  - `onProgress(info)`: real-time progress callback (required)
  - `allowedTools` / `disallowedTools`: tool filtering (comma-separated strings, e.g. `"Write,Read"`)
  - `maxTurns`: limit agentic turns
  - `timeoutMs`: overall timeout (default: 10 minutes)
  - `onPid(pid)`: PID tracking callback
  - `signal`: AbortSignal for cancellation
  - `spawnHealthTimeoutMs`: warn if no output within timeout (default: 30s)
  - `sessionId` / `resume`: session management flags
  - `dangerouslySkipPermissions`: skip permission checks
  - `verbose`: enable verbose output (default: true)
  - `extraArgs`: extra CLI args (e.g. `["--model", "opus"]`)
  - `env`: additional environment variables

- `isClaudeCliAvailable()` — checks if `claude` binary is on PATH

### Low-Level

- `spawnClaude(options)` — low-level CLI spawner, returns `ClaudeProcess` handle with event-driven API (`onEvent`, `onRawLine`, `onStderr`, `onExit`, `onError`, `kill`, `exited`)
- `buildArgs(options)` — build the CLI argument array from `SpawnClaudeOptions`
- `parseStreamJsonEvent(evt, cwd)` — parse a single stream-json event into `{ log?, logType?, chunk? }`

## Usage Pattern

```typescript
const result = await runClaude({
  prompt: "Fix the TypeScript errors",
  cwd: "/path/to/repo",
  allowedTools: "Write,Read",
  onProgress: (info) => emitEvent(info),
  signal: abortController.signal,
});
```
