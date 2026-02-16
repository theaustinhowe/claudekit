/**
 * Timeout utility for the GoGo orchestrator.
 *
 * Provides timeout wrapping for async operations to prevent hanging
 * during GitHub API calls, Git operations, and database queries.
 */

/**
 * Predefined timeout values for common operations.
 */
export const TIMEOUTS = {
  /** 30 seconds for GitHub API calls */
  GITHUB_API: 30_000,
  /** 2 minutes for Git operations (clone, fetch, push, etc.) */
  GIT_OPERATION: 120_000,
  /** 10 seconds for database queries */
  DATABASE_QUERY: 10_000,
  /** 5 seconds for graceful process termination */
  PROCESS_TERM: 5_000,
} as const;

/**
 * Error thrown when an operation exceeds its timeout duration.
 */
export class TimeoutError extends Error {
  public readonly operationName: string;
  public readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number) {
    super(`Operation "${operationName}" timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Wraps a promise with a timeout.
 *
 * Races the provided promise against a timeout. If the timeout is reached
 * before the promise resolves or rejects, a TimeoutError is thrown.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - The timeout duration in milliseconds
 * @param operationName - A descriptive name for the operation (used in error messages)
 * @returns The resolved value of the promise if it completes before the timeout
 * @throws {TimeoutError} If the timeout is reached before the promise settles
 *
 * @example
 * ```typescript
 * import { withTimeout, TIMEOUTS, TimeoutError } from './utils/timeout';
 *
 * try {
 *   const result = await withTimeout(
 *     fetchGitHubIssues(),
 *     TIMEOUTS.GITHUB_API,
 *     'fetch GitHub issues'
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error(`Timed out: ${error.operationName}`);
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
