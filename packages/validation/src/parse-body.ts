import type { z } from "zod";
import type { ParseResult } from "./types";

/** Parse request body with a Zod schema. Returns { ok, data } or { ok, error, status }. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON in request body", status: 400 };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .slice(0, 5)
      .join("; ");
    return { ok: false, error: `Validation failed: ${messages}`, status: 422 };
  }

  return { ok: true, data: result.data };
}

/** Parse query params with a Zod schema. Returns { ok, data } or { ok, error, status }. */
export function parseQuery<T>(params: Record<string, unknown>, schema: z.ZodType<T>): ParseResult<T> {
  const result = schema.safeParse(params);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .slice(0, 5)
      .join("; ");
    return { ok: false, error: `Validation failed: ${messages}`, status: 422 };
  }

  return { ok: true, data: result.data };
}
