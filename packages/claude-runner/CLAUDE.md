# @devkit/claude-runner

Shared Claude CLI runner for spawning Claude Code processes with stream-json output parsing.

## API

- `runClaude(options)` — spawn Claude CLI, returns `Promise<ClaudeResult>`
  - `prompt`: the prompt to send
  - `cwd`: working directory
  - `allowedTools` / `disallowedTools`: tool filtering
  - `model`: override model
  - `maxTurns`: limit turns
  - `onProgress(info)`: real-time progress callback
  - `onPid(pid)`: PID tracking callback
  - `signal`: AbortSignal for cancellation
  - `spawnHealthTimeoutMs`: warn if no output within timeout (default: 30s)

- `isClaudeCliAvailable()` — checks if `claude` binary is on PATH

## Usage Pattern

```typescript
const result = await runClaude({
  prompt: "Fix the TypeScript errors",
  cwd: "/path/to/repo",
  allowedTools: ["Write", "Read"],
  onProgress: (info) => emitEvent(info),
  signal: abortController.signal,
});
```
