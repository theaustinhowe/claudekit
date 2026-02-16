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

  it("returns seconds ago for recent dates", () => {
    const thirtySecondsAgo = new Date("2024-06-15T11:59:30Z");
    expect(formatLastChecked(thirtySecondsAgo)).toBe("30s ago");
  });

  it("returns 0s ago for the current time", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    expect(formatLastChecked(now)).toBe("0s ago");
  });

  it("returns minutes ago for dates within the hour", () => {
    const fiveMinutesAgo = new Date("2024-06-15T11:55:00Z");
    expect(formatLastChecked(fiveMinutesAgo)).toBe("5m ago");
  });

  it("returns locale time string for dates older than 1 hour", () => {
    const twoHoursAgo = new Date("2024-06-15T10:00:00Z");
    const result = formatLastChecked(twoHoursAgo);
    expect(result).not.toContain("ago");
    expect(result).toBe(twoHoursAgo.toLocaleTimeString());
  });

  it("accepts a string date", () => {
    const result = formatLastChecked("2024-06-15T11:59:45Z");
    expect(result).toBe("15s ago");
  });

  it("returns 59s ago at the boundary before 1 minute", () => {
    const fiftyNineSecondsAgo = new Date("2024-06-15T11:59:01Z");
    expect(formatLastChecked(fiftyNineSecondsAgo)).toBe("59s ago");
  });

  it("returns 1m ago at exactly 60 seconds", () => {
    const sixtySecondsAgo = new Date("2024-06-15T11:59:00Z");
    expect(formatLastChecked(sixtySecondsAgo)).toBe("1m ago");
  });

  it("returns 59m ago at the boundary before 1 hour", () => {
    const fiftyNineMinutesAgo = new Date("2024-06-15T11:01:00Z");
    expect(formatLastChecked(fiftyNineMinutesAgo)).toBe("59m ago");
  });

  it("returns locale time at exactly 1 hour", () => {
    const oneHourAgo = new Date("2024-06-15T11:00:00Z");
    const result = formatLastChecked(oneHourAgo);
    expect(result).toBe(oneHourAgo.toLocaleTimeString());
  });
});
