import { beforeEach, describe, expect, it, vi } from "vitest";
import { delay, uid } from "@/lib/utils";

describe("uid", () => {
  it("returns a string starting with msg-", () => {
    const id = uid();
    expect(id).toMatch(/^msg-/);
  });

  it("includes a timestamp segment", () => {
    const before = Date.now();
    const id = uid();
    const after = Date.now();
    const parts = id.split("-");
    const ts = Number(parts[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("generates unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });

  it("increments the counter suffix", () => {
    const id1 = uid();
    const id2 = uid();
    const counter1 = Number(id1.split("-").pop());
    const counter2 = Number(id2.split("-").pop());
    expect(counter2).toBe(counter1 + 1);
  });
});

describe("delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after the specified time", async () => {
    const promise = delay(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });

  it("does not resolve before the specified time", async () => {
    let resolved = false;
    delay(1000).then(() => {
      resolved = true;
    });
    vi.advanceTimersByTime(999);
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("returns a Promise<void>", () => {
    const result = delay(0);
    expect(result).toBeInstanceOf(Promise);
    vi.advanceTimersByTime(0);
  });
});
