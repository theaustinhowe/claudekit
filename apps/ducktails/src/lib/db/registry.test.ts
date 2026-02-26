import { describe, expect, it } from "vitest";
import { DATABASE_REGISTRY, getDatabaseEntry } from "./registry";

describe("getDatabaseEntry", () => {
  it("returns the entry for a known database id", () => {
    const entry = getDatabaseEntry("gadget");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("gadget");
    expect(entry?.name).toBe("Gadget");
    expect(entry?.path).toContain("gadget");
  });

  it("returns undefined for an unknown id", () => {
    expect(getDatabaseEntry("nonexistent")).toBeUndefined();
  });

  it("can find every registered database", () => {
    for (const entry of DATABASE_REGISTRY) {
      expect(getDatabaseEntry(entry.id)).toBe(entry);
    }
  });
});
