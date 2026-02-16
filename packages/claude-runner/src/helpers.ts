/**
 * Create a progress estimator that asymptotically approaches `endPct` from `startPct`.
 * Useful for giving the user a sense of progress during Claude CLI runs where
 * real completion % is unknown.
 *
 * @param startPct  The progress % when the estimator starts (e.g. 10)
 * @param endPct    The max progress % to approach but never reach (e.g. 80)
 * @param durationSec  Approximate duration in seconds to reach ~90% of the range
 * @returns A function that returns the current estimated progress (call repeatedly)
 */
export function createProgressEstimator(startPct: number, endPct: number, durationSec: number): () => number {
  const startTime = Date.now();
  const range = endPct - startPct;

  return () => {
    const elapsed = (Date.now() - startTime) / 1000;
    // Asymptotic curve: approaches 1 as elapsed → ∞, ~0.9 at durationSec
    const factor = 1 - Math.exp((-2.3 * elapsed) / durationSec);
    return Math.round(startPct + range * factor);
  };
}

/**
 * Extract the first JSON object or array from Claude CLI output.
 * Claude often wraps JSON in markdown code fences — this handles both
 * fenced and raw JSON.
 *
 * @param stdout  Raw stdout from Claude CLI
 * @returns Parsed JSON, or null if no valid JSON found
 */
export function parseJsonFromClaude(stdout: string): Record<string, unknown> | unknown[] | null {
  // Try fenced JSON block first: ```json ... ```
  const fencedMatch = stdout.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {
      // Fall through to other patterns
    }
  }

  // Try to find a JSON object or array
  const jsonMatch = stdout.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // No valid JSON found
    }
  }

  return null;
}
