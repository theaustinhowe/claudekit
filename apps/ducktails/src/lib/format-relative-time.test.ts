import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "./format-relative-time";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 10 seconds', () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe("just now");
    expect(formatRelativeTime(now - 5_000)).toBe("just now");
    expect(formatRelativeTime(now - 9_999)).toBe("just now");
  });

  it("returns seconds ago for 10-59 seconds", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10_000)).toBe("10s ago");
    expect(formatRelativeTime(now - 30_000)).toBe("30s ago");
    expect(formatRelativeTime(now - 59_000)).toBe("59s ago");
  });

  it("returns minutes ago for 1-59 minutes", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 60_000)).toBe("1m ago");
    expect(formatRelativeTime(now - 5 * 60_000)).toBe("5m ago");
    expect(formatRelativeTime(now - 59 * 60_000)).toBe("59m ago");
  });

  it("returns hours ago for 1-23 hours", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 3_600_000)).toBe("1h ago");
    expect(formatRelativeTime(now - 12 * 3_600_000)).toBe("12h ago");
    expect(formatRelativeTime(now - 23 * 3_600_000)).toBe("23h ago");
  });

  it("returns days ago for 1-29 days", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 86_400_000)).toBe("1d ago");
    expect(formatRelativeTime(now - 7 * 86_400_000)).toBe("7d ago");
    expect(formatRelativeTime(now - 29 * 86_400_000)).toBe("29d ago");
  });

  it("returns locale date string for >= 30 days", () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86_400_000;
    const result = formatRelativeTime(thirtyDaysAgo);
    // Should be a date string, not a relative time
    expect(result).not.toContain("ago");
    expect(result).not.toBe("just now");
  });
});
