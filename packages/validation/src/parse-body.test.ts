import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody, parseQuery } from "./parse-body";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json{{{",
  });
}

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0).optional(),
});

describe("parseBody", () => {
  it("returns ok with data for valid JSON matching schema", async () => {
    const req = jsonRequest({ name: "Alice", email: "alice@example.com" });
    const result = await parseBody(req, userSchema);
    expect(result).toEqual({ ok: true, data: { name: "Alice", email: "alice@example.com" } });
  });

  it("returns 400 for invalid JSON", async () => {
    const req = invalidJsonRequest();
    const result = await parseBody(req, userSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns 422 for valid JSON failing validation", async () => {
    const req = jsonRequest({ name: 123, email: "not-an-email" });
    const result = await parseBody(req, userSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain("Validation failed");
    }
  });

  it("includes field path in error messages", async () => {
    const nestedSchema = z.object({
      user: z.object({
        email: z.string().email(),
      }),
    });
    const req = jsonRequest({ user: { email: "bad" } });
    const result = await parseBody(req, nestedSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("user.email");
    }
  });

  it("truncates error messages to first 5 issues", async () => {
    const strictSchema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
      g: z.string(),
    });
    const req = jsonRequest({});
    const result = await parseBody(req, strictSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issueCount = result.error.split(";").length;
      expect(issueCount).toBeLessThanOrEqual(5);
    }
  });

  it("succeeds when optional fields are omitted", async () => {
    const req = jsonRequest({ name: "Bob", email: "bob@test.com" });
    const result = await parseBody(req, userSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.age).toBeUndefined();
    }
  });
});

describe("parseQuery", () => {
  const querySchema = z.object({
    page: z.coerce.number().min(1),
    limit: z.coerce.number().min(1).max(100).optional(),
  });

  it("returns ok with data for valid params", () => {
    const result = parseQuery({ page: 1, limit: 10 }, querySchema);
    expect(result).toEqual({ ok: true, data: { page: 1, limit: 10 } });
  });

  it("returns 422 for invalid params", () => {
    const result = parseQuery({ page: 0 }, querySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
    }
  });

  it("includes field path in error messages", () => {
    const result = parseQuery({ page: -1 }, querySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("page");
    }
  });

  it("truncates to 5 issues", () => {
    const bigSchema = z.object({
      a: z.number(),
      b: z.number(),
      c: z.number(),
      d: z.number(),
      e: z.number(),
      f: z.number(),
      g: z.number(),
    });
    const result = parseQuery({}, bigSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issueCount = result.error.split(";").length;
      expect(issueCount).toBeLessThanOrEqual(5);
    }
  });

  it("succeeds with empty params when schema fields are optional", () => {
    const optionalSchema = z.object({
      search: z.string().optional(),
      page: z.number().optional(),
    });
    const result = parseQuery({}, optionalSchema);
    expect(result.ok).toBe(true);
  });
});
