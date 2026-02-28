# @claudekit/validation

Shared Zod-based request validation helpers for claudekit API routes. Provides `parseBody` and `parseQuery` with consistent error formatting and typed results.

## Usage

```typescript
import { parseBody, parseQuery } from "@claudekit/validation";
import { z } from "zod";

// In a Next.js API route handler
export async function POST(request: Request) {
  const result = await parseBody(request, z.object({
    name: z.string(),
    email: z.string().email(),
  }));

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // result.data is fully typed
  const { name, email } = result.data;
}

// For query params
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = parseQuery(
    Object.fromEntries(url.searchParams),
    z.object({ page: z.coerce.number().min(1) }),
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
}
```

## Directory Tree

```
src/
  index.ts           # Barrel export
  types.ts           # ParseResult<T> type
  parse-body.ts      # parseBody and parseQuery implementations
  parse-body.test.ts # Tests
```

## API

### `parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<ParseResult<T>>`

Parse a JSON request body against a Zod schema.

- Returns `{ ok: true, data: T }` on success
- Returns `{ ok: false, error: string, status: 400 }` for invalid JSON
- Returns `{ ok: false, error: string, status: 422 }` for validation failures
- Error messages include field paths (e.g. `user.email: Invalid email`)
- Truncates to first 5 validation issues

### `parseQuery<T>(params: Record<string, unknown>, schema: z.ZodType<T>): ParseResult<T>`

Parse query parameters (synchronous) against a Zod schema.

- Returns `{ ok: true, data: T }` on success
- Returns `{ ok: false, error: string, status: 422 }` for validation failures
- Same error formatting as `parseBody`

### `ParseResult<T>`

```typescript
type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
```

## Dependencies

- **`zod`** (v4) — schema definition and validation (provided by consumer, imported as type-only in `parse-body.ts`)

No dependencies on other `@claudekit` packages.

## Consumers

- `apps/b4u` — re-exports `parseBody` via `src/lib/validations.ts`

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsc --noEmit --watch` |
| `build` | `tsc --noEmit` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `test` | `vitest run` |
