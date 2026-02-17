import { describe, expect, it } from "vitest";
import { securityHeaders } from "./next-config";

describe("securityHeaders", () => {
  it("returns array with one entry having source '/(.*)'", () => {
    const result = securityHeaders();
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("/(.*)");
  });

  it("contains expected security headers", () => {
    const headers = securityHeaders()[0].headers;
    const keys = headers.map((h) => h.key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
    expect(keys).toContain("X-XSS-Protection");
  });

  it("all headers have non-empty string values", () => {
    const headers = securityHeaders()[0].headers;
    for (const header of headers) {
      expect(typeof header.value).toBe("string");
      expect(header.value.length).toBeGreaterThan(0);
    }
  });
});
