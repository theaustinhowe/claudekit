import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLastChecked } from "@/lib/utils";

describe("formatLastChecked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent dates under 60 seconds', () => {
    const thirtySecondsAgo = new Date("2024-06-15T11:59:30Z");
    expect(formatLastChecked(thirtySecondsAgo)).toBe("just now");
  });

  it('returns "just now" for the current time', () => {
    const now = new Date("2024-06-15T12:00:00Z");
    expect(formatLastChecked(now)).toBe("just now");
  });

  it("returns minutes ago for dates within the hour", () => {
    const fiveMinutesAgo = new Date("2024-06-15T11:55:00Z");
    expect(formatLastChecked(fiveMinutesAgo)).toBe("5m ago");
  });

  it("returns hours ago for dates older than 1 hour", () => {
    const twoHoursAgo = new Date("2024-06-15T10:00:00Z");
    expect(formatLastChecked(twoHoursAgo)).toBe("2h ago");
  });

  it("accepts a string date", () => {
    const result = formatLastChecked("2024-06-15T11:59:45Z");
    expect(result).toBe("just now");
  });

  it('returns "just now" at the boundary before 1 minute', () => {
    const fiftyNineSecondsAgo = new Date("2024-06-15T11:59:01Z");
    expect(formatLastChecked(fiftyNineSecondsAgo)).toBe("just now");
  });

  it("returns 1m ago at exactly 60 seconds", () => {
    const sixtySecondsAgo = new Date("2024-06-15T11:59:00Z");
    expect(formatLastChecked(sixtySecondsAgo)).toBe("1m ago");
  });

  it("returns 59m ago at the boundary before 1 hour", () => {
    const fiftyNineMinutesAgo = new Date("2024-06-15T11:01:00Z");
    expect(formatLastChecked(fiftyNineMinutesAgo)).toBe("59m ago");
  });

  it("returns hours ago at exactly 1 hour", () => {
    const oneHourAgo = new Date("2024-06-15T11:00:00Z");
    expect(formatLastChecked(oneHourAgo)).toBe("1h ago");
  });

  it("returns days ago for dates older than 24 hours", () => {
    const twoDaysAgo = new Date("2024-06-13T12:00:00Z");
    expect(formatLastChecked(twoDaysAgo)).toBe("2d ago");
  });

  it("returns formatted date for dates older than 7 days", () => {
    const twoWeeksAgo = new Date("2024-06-01T12:00:00Z");
    expect(formatLastChecked(twoWeeksAgo)).toBe("Jun 1, 2024");
  });
});
