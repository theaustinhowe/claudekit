import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const mockState = {
  currentPhase: 1 as const,
  phaseStatuses: {
    1: "active" as const,
    2: "locked" as const,
    3: "locked" as const,
    4: "locked" as const,
    5: "locked" as const,
    6: "locked" as const,
    7: "locked" as const,
  },
  threads: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<number, unknown[]>,
  activeThreadIds: {
    1: null as string | null,
    2: null as string | null,
    3: null as string | null,
    4: null as string | null,
    5: null as string | null,
    6: null as string | null,
    7: null as string | null,
  },
  viewingPhase: 1 as const,
  isTyping: false,
  projectName: "",
  rightPanelContent: null,
  editMode: null,
  projectPath: null as string | null,
  activeSessionId: null,
  fileBrowserOpen: false,
  historySidebarOpen: false,
  runId: null as string | null,
  panelRefreshKey: 0,
};

vi.mock("@/lib/store", () => ({
  useApp: () => ({ state: mockState, dispatch: vi.fn() }),
}));

type EffectCallback = () => undefined | (() => void);
type EventHandler = (...args: never[]) => unknown;

// Track registered event listeners
const windowListeners: Record<string, EventHandler[]> = {};
const documentListeners: Record<string, EventHandler[]> = {};

// Track useEffect callbacks
let effectCallbacks: Array<{ deps: unknown[]; cb: EffectCallback; cleanup?: () => void }> = [];
let callbackFns: Map<EventHandler, EventHandler> = new Map();
let refObjects: Map<string, { current: unknown }> = new Map();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: (fn: EventHandler, _deps: unknown[]) => {
      callbackFns.set(fn, fn);
      return fn;
    },
    useRef: (initial: unknown) => {
      // Return stable refs for repeated calls
      const key = JSON.stringify(initial);
      if (!refObjects.has(key)) {
        refObjects.set(key, { current: initial });
      }
      // biome-ignore lint/style/noNonNullAssertion: value is guaranteed to exist after the set above
      return refObjects.get(key)!;
    },
    useEffect: (cb: EffectCallback, deps: unknown[]) => {
      effectCallbacks.push({ deps, cb });
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useStateSync", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockSendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    effectCallbacks = [];
    callbackFns = new Map();
    refObjects = new Map();

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    mockSendBeacon = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { sendBeacon: mockSendBeacon },
      writable: true,
      configurable: true,
    });

    // Reset mock state
    mockState.runId = null;
    mockState.threads = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    mockState.activeThreadIds = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
    mockState.currentPhase = 1;
    mockState.projectPath = null;
    mockState.projectName = "";

    // Mock window/document event listeners
    for (const key of Object.keys(windowListeners)) delete windowListeners[key];
    for (const key of Object.keys(documentListeners)) delete documentListeners[key];

    vi.stubGlobal("window", {
      addEventListener: (event: string, fn: EventHandler) => {
        if (!windowListeners[event]) windowListeners[event] = [];
        windowListeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: EventHandler) => {
        if (windowListeners[event]) {
          windowListeners[event] = windowListeners[event].filter((f) => f !== fn);
        }
      },
    });

    vi.stubGlobal("document", {
      addEventListener: (event: string, fn: EventHandler) => {
        if (!documentListeners[event]) documentListeners[event] = [];
        documentListeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: EventHandler) => {
        if (documentListeners[event]) {
          documentListeners[event] = documentListeners[event].filter((f) => f !== fn);
        }
      },
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("registers beforeunload and visibilitychange listeners", async () => {
    const mod = await import("./use-state-sync");
    mod.useStateSync();

    // Run the effect that registers listeners (should be the first useEffect)
    const listenerEffect = effectCallbacks.find(
      (e) => e.deps.length === 1, // [flushBeacon]
    );
    expect(listenerEffect).toBeDefined();
    listenerEffect?.cb();

    expect(windowListeners.beforeunload).toBeDefined();
    expect(windowListeners.beforeunload.length).toBe(1);
    expect(documentListeners.visibilitychange).toBeDefined();
    expect(documentListeners.visibilitychange.length).toBe(1);
  });

  it("does not save state when runId is null", async () => {
    mockState.runId = null;
    mockState.threads = { 1: [{ id: "t-1" }] as unknown[], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

    const mod = await import("./use-state-sync");
    mod.useStateSync();

    // Run all effects
    for (const effect of effectCallbacks) {
      effect.cb();
    }

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not save state when no threads exist", async () => {
    mockState.runId = "run-123";
    mockState.threads = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

    const mod = await import("./use-state-sync");
    mod.useStateSync();

    // Run effects
    for (const effect of effectCallbacks) {
      effect.cb();
    }

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("exports useStateSync as a function", async () => {
    const mod = await import("./use-state-sync");
    expect(typeof mod.useStateSync).toBe("function");
  });

  it("creates stable ref objects for tracking state", async () => {
    const mod = await import("./use-state-sync");
    mod.useStateSync();

    // Should have created refs (timer, lastJson, pendingPayload, runId, prevRunId)
    expect(refObjects.size).toBeGreaterThanOrEqual(1);
  });

  it("sets up debounced save effects", async () => {
    const mod = await import("./use-state-sync");
    mod.useStateSync();

    // Should register multiple useEffect calls:
    // 1. listener registration
    // 2. combined run-change effect
    // 3. unmount flush
    // 4. debounced save
    expect(effectCallbacks.length).toBeGreaterThanOrEqual(3);
  });
});
