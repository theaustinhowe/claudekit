import { describe, expect, it } from "vitest";

import { getLogs, getStatus, stop } from "./dev-server-manager";

describe("dev-server-manager", () => {
  describe("getStatus", () => {
    it("returns null for unknown project", () => {
      expect(getStatus("nonexistent")).toBeNull();
    });
  });

  describe("getLogs", () => {
    it("returns empty array for unknown project", () => {
      expect(getLogs("unknown")).toEqual([]);
    });
  });

  describe("stop", () => {
    it("does not throw for unknown project", () => {
      expect(() => stop("unknown")).not.toThrow();
    });
  });
});
