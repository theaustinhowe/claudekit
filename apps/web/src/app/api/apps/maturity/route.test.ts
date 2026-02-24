import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/maturity", () => ({
  readMaturityOverrides: vi.fn(),
  writeMaturityOverrides: vi.fn(),
}));

import { readMaturityOverrides, writeMaturityOverrides } from "@/lib/maturity";
import { GET, PUT } from "./route";

const mockReadMaturityOverrides = vi.mocked(readMaturityOverrides);
const mockWriteMaturityOverrides = vi.mocked(writeMaturityOverrides);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/apps/maturity", () => {
  it("returns maturity overrides", async () => {
    mockReadMaturityOverrides.mockReturnValue({ gadget: 75, inspector: 50 });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ gadget: 75, inspector: 50 });
  });

  it("returns empty object when no overrides exist", async () => {
    mockReadMaturityOverrides.mockReturnValue({});

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({});
  });
});

describe("PUT /api/apps/maturity", () => {
  it("writes valid overrides and returns ok", async () => {
    const body = { gadget: 80, inspector: 60 };

    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockWriteMaturityOverrides).toHaveBeenCalledWith(body);
  });

  it("accepts empty object", async () => {
    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });

  it("returns 400 for value greater than 100", async () => {
    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gadget: 150 }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("gadget");
    expect(data.error).toContain("0-100");
  });

  it("returns 400 for negative value", async () => {
    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspector: -5 }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("inspector");
  });

  it("returns 400 for non-number value", async () => {
    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gadget: "high" }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("gadget");
  });

  it("accepts boundary values 0 and 100", async () => {
    const body = { low: 0, high: 100 };

    const request = new Request("http://localhost:2000/api/apps/maturity", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });
});
