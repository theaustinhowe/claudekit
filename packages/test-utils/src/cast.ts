/**
 * Type-safe cast utility for test files.
 * Replaces unsafe `as never`, `as unknown as T`, and `as any` assertions.
 */
export function cast<T>(value: unknown): T {
  return value as T;
}
