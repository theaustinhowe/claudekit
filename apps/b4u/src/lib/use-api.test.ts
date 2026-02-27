import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Track hook state
// ---------------------------------------------------------------------------

type EffectCallback = () => undefined | (() => void);

// Collect effect callbacks for manual execution
let effectCallbacks: Array<{ cb: EffectCallback; deps: unknown[] }> = [];
let stateSetters: Map<string, (v: unknown) => void> = new Map();
let stateValues: Map<string, unknown> = new Map();
let stateIndex = 0;

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => {
      const key = `state-${stateIndex++}`;
      if (!stateValues.has(key)) {
        const resolvedInitial = typeof initial === "function" ? (initial as () => unknown)() : initial;
        stateValues.set(key, resolvedInitial);
      }
      const setter = (valOrFn: unknown) => {
        const current = stateValues.get(key);
        const newVal = typeof valOrFn === "function" ? (valOrFn as (prev: unknown) => unknown)(current) : valOrFn;
        stateValues.set(key, newVal);
      };
      stateSetters.set(key, setter);
      return [stateValues.get(key), setter];
    },
    useCallback: (fn: (...args: never[]) => unknown) => fn,
    useEffect: (cb: EffectCallback, deps: unknown[]) => {
      effectCallbacks.push({ cb, deps });
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useApi", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    effectCallbacks = [];
    stateSetters = new Map();
    stateValues = new Map();
    stateIndex = 0;

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns initial state with loading true", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });

    const mod = await import("./use-api");
    const result = mod.useApi<{ items: unknown[] }>("/api/data");

    expect(result.loading).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    expect(typeof result.refetch).toBe("function");
  });

  it("fetches data on mount via useEffect", async () => {
    const mockData = { items: [1, 2, 3] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const mod = await import("./use-api");
    mod.useApi("/api/items");

    // Should register a useEffect
    expect(effectCallbacks.length).toBeGreaterThan(0);

    // Run the fetch effect
    const fetchEffect = effectCallbacks[0];
    fetchEffect.cb();

    // Wait for async fetch to complete
    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/items");
    });
  });

  it("handles fetch errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const mod = await import("./use-api");
    mod.useApi("/api/missing");

    // Run the effect
    const fetchEffect = effectCallbacks[0];
    fetchEffect.cb();

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/missing");
    });
  });

  it("handles network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const mod = await import("./use-api");
    mod.useApi("/api/broken");

    const fetchEffect = effectCallbacks[0];
    fetchEffect.cb();

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/broken");
    });
  });

  it("provides a refetch function that increments fetchKey", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const mod = await import("./use-api");
    const result = mod.useApi("/api/data");

    expect(typeof result.refetch).toBe("function");
    // refetch should be callable without error
    result.refetch();
  });

  it("returns cleanup function from effect", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const mod = await import("./use-api");
    mod.useApi("/api/data");

    const fetchEffect = effectCallbacks[0];
    const cleanup = fetchEffect.cb();

    expect(typeof cleanup).toBe("function");
  });

  it("includes url in effect dependencies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const mod = await import("./use-api");
    mod.useApi("/api/test-url");

    const fetchEffect = effectCallbacks[0];
    expect(fetchEffect.deps).toContain("/api/test-url");
  });

  it("includes refreshKey in effect dependencies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const mod = await import("./use-api");
    mod.useApi("/api/data", 42);

    const fetchEffect = effectCallbacks[0];
    expect(fetchEffect.deps).toContain(42);
  });

  it("changing refreshKey triggers a new fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ v: 1 }),
    });

    const mod = await import("./use-api");

    // First call with refreshKey=0
    mod.useApi("/api/data", 0);
    const firstEffect = effectCallbacks[0];
    firstEffect.cb();

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Reset state for second render
    effectCallbacks = [];
    stateIndex = 0;

    // Second call with refreshKey=1
    mod.useApi("/api/data", 1);
    const secondEffect = effectCallbacks[0];
    // The deps should include the new refreshKey
    expect(secondEffect.deps).toContain(1);
    secondEffect.cb();

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
