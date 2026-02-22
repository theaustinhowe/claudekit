import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Track hook state
// ---------------------------------------------------------------------------

let stateIndex = 0;
let stateValues: Map<string, unknown> = new Map();

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
      return [stateValues.get(key), setter];
    },
    useCallback: (fn: Function) => fn,
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useRunParam", () => {
  let mockUrl: URL;
  let replaceStateCalls: Array<{ state: unknown; title: string; url: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    stateIndex = 0;
    stateValues = new Map();
    replaceStateCalls = [];

    mockUrl = new URL("http://localhost:2300/");

    vi.stubGlobal("window", {
      location: {
        get search() {
          return mockUrl.search;
        },
        get href() {
          return mockUrl.href;
        },
      },
      history: {
        replaceState: (state: unknown, title: string, url: string) => {
          replaceStateCalls.push({ state, title, url });
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null initialRunId when no run param", async () => {
    const mod = await import("./use-run-param");
    const { initialRunId } = mod.useRunParam();

    expect(initialRunId).toBeNull();
  });

  it("reads run param from URL search params", async () => {
    mockUrl = new URL("http://localhost:2300/?run=abc-123");

    const mod = await import("./use-run-param");
    const { initialRunId } = mod.useRunParam();

    expect(initialRunId).toBe("abc-123");
  });

  it("setRunId sets the run param in the URL", async () => {
    const mod = await import("./use-run-param");
    const { setRunId } = mod.useRunParam();

    setRunId("new-run-id");

    expect(replaceStateCalls.length).toBe(1);
    const newUrl = new URL(replaceStateCalls[0].url);
    expect(newUrl.searchParams.get("run")).toBe("new-run-id");
  });

  it("setRunId with null removes the run param", async () => {
    mockUrl = new URL("http://localhost:2300/?run=old-id&other=keep");

    const mod = await import("./use-run-param");
    const { setRunId } = mod.useRunParam();

    setRunId(null);

    expect(replaceStateCalls.length).toBe(1);
    const newUrl = new URL(replaceStateCalls[0].url);
    expect(newUrl.searchParams.has("run")).toBe(false);
    expect(newUrl.searchParams.get("other")).toBe("keep");
  });

  it("setRunId preserves other query params", async () => {
    mockUrl = new URL("http://localhost:2300/?theme=dark&tab=2");

    const mod = await import("./use-run-param");
    const { setRunId } = mod.useRunParam();

    setRunId("my-run");

    expect(replaceStateCalls.length).toBe(1);
    const newUrl = new URL(replaceStateCalls[0].url);
    expect(newUrl.searchParams.get("run")).toBe("my-run");
    expect(newUrl.searchParams.get("theme")).toBe("dark");
    expect(newUrl.searchParams.get("tab")).toBe("2");
  });

  it("returns empty string param as null", async () => {
    mockUrl = new URL("http://localhost:2300/?run=");

    const mod = await import("./use-run-param");
    const { initialRunId } = mod.useRunParam();

    // URLSearchParams.get returns "" for ?run=, which is falsy
    expect(initialRunId).toBeNull();
  });

  it("returns setRunId as a stable function", async () => {
    const mod = await import("./use-run-param");
    const { setRunId } = mod.useRunParam();

    expect(typeof setRunId).toBe("function");
  });
});
