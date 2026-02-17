import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  flowScriptsArraySchema,
  parseBody,
  routesArraySchema,
  togglePatchSchema,
  userFlowsArraySchema,
  voiceoverScriptsSchema,
} from "@/lib/validations";

describe("routesArraySchema", () => {
  it("accepts valid route entries", () => {
    const data = [
      { path: "/dashboard", title: "Dashboard", authRequired: true, description: "Main page" },
      { path: "/login", title: "Login", authRequired: false },
    ];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("defaults description to empty string", () => {
    const data = [{ path: "/home", title: "Home", authRequired: false }];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].description).toBe("");
    }
  });

  it("rejects path without leading slash", () => {
    const data = [{ path: "dashboard", title: "Dashboard", authRequired: true }];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty path", () => {
    const data = [{ path: "", title: "Dashboard", authRequired: true }];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const data = [{ path: "/x", title: "", authRequired: false }];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 routes", () => {
    const data = Array.from({ length: 51 }, (_, i) => ({
      path: `/${i}`,
      title: `Route ${i}`,
      authRequired: false,
    }));
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects path over 200 characters", () => {
    const data = [{ path: `/${"a".repeat(200)}`, title: "Long", authRequired: false }];
    const result = routesArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("userFlowsArraySchema", () => {
  it("accepts valid user flows", () => {
    const data = [{ id: "flow-1", name: "Onboarding", steps: ["/register", "/dashboard"] }];
    const result = userFlowsArraySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects flow with no steps", () => {
    const data = [{ id: "flow-1", name: "Empty", steps: [] }];
    const result = userFlowsArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 steps per flow", () => {
    const data = [{ id: "flow-1", name: "Many", steps: Array.from({ length: 21 }, (_, i) => `step-${i}`) }];
    const result = userFlowsArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 flows", () => {
    const data = Array.from({ length: 21 }, (_, i) => ({
      id: `flow-${i}`,
      name: `Flow ${i}`,
      steps: ["step1"],
    }));
    const result = userFlowsArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("togglePatchSchema", () => {
  it("accepts valid toggle", () => {
    const result = togglePatchSchema.safeParse({ id: "seed-db", enabled: true, runId: "run-1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = togglePatchSchema.safeParse({ enabled: true });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = togglePatchSchema.safeParse({ id: "", enabled: true });
    expect(result.success).toBe(false);
  });

  it("rejects missing enabled", () => {
    const result = togglePatchSchema.safeParse({ id: "seed-db" });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean enabled", () => {
    const result = togglePatchSchema.safeParse({ id: "seed-db", enabled: "true" });
    expect(result.success).toBe(false);
  });
});

describe("flowScriptsArraySchema", () => {
  it("accepts valid flow scripts", () => {
    const data = [
      {
        flowId: "onboarding",
        flowName: "Onboarding",
        steps: [
          {
            id: "o1",
            stepNumber: 1,
            url: "/register",
            action: "Fill form",
            expectedOutcome: "Form validates",
            duration: "4s",
          },
        ],
      },
    ];
    const result = flowScriptsArraySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("defaults expectedOutcome to empty string", () => {
    const data = [
      {
        flowId: "f1",
        flowName: "Flow",
        steps: [{ id: "s1", stepNumber: 1, url: "/x", action: "Do thing", duration: "2s" }],
      },
    ];
    const result = flowScriptsArraySchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].steps[0].expectedOutcome).toBe("");
    }
  });

  it("rejects more than 50 steps per flow", () => {
    const steps = Array.from({ length: 51 }, (_, i) => ({
      id: `s${i}`,
      stepNumber: i + 1,
      url: "/x",
      action: "Do thing",
      duration: "2s",
    }));
    const data = [{ flowId: "f1", flowName: "Flow", steps }];
    const result = flowScriptsArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects step number below 1", () => {
    const data = [
      {
        flowId: "f1",
        flowName: "Flow",
        steps: [{ id: "s1", stepNumber: 0, url: "/x", action: "Do thing", duration: "2s" }],
      },
    ];
    const result = flowScriptsArraySchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("voiceoverScriptsSchema", () => {
  it("accepts valid voiceover scripts", () => {
    const data = { onboarding: ["Paragraph 1", "Paragraph 2"], billing: ["Paragraph 1"] };
    const result = voiceoverScriptsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects paragraph over 5000 characters", () => {
    const data = { flow: ["a".repeat(5001)] };
    const result = voiceoverScriptsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays", () => {
    const data = { flow: [] };
    const result = voiceoverScriptsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("parseBody", () => {
  const testSchema = z.object({ name: z.string().min(1), age: z.number() });

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns ok with valid data", async () => {
    const req = makeRequest({ name: "Alice", age: 30 });
    const result = await parseBody(req, testSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not json{{",
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody(req, testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns 422 for validation failure", async () => {
    const req = makeRequest({ name: "", age: "not a number" });
    const result = await parseBody(req, testSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain("Validation failed");
    }
  });

  it("limits validation error messages to 5", async () => {
    const schema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
      g: z.string(),
    });
    const req = makeRequest({});
    const result = await parseBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const parts = result.error.replace("Validation failed: ", "").split("; ");
      expect(parts.length).toBeLessThanOrEqual(5);
    }
  });
});
