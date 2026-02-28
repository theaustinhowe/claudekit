import { cast } from "@claudekit/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory localStorage mock
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

vi.stubGlobal("localStorage", localStorageMock);
// Stub window so `typeof window !== "undefined"` passes in the useState initializer
vi.stubGlobal("window", {});

// Mutable state container -- shared across useState and setState calls
const stateBox = { value: cast<unknown[]>([]) };

vi.mock("react", () => ({
  useState: (init: unknown) => {
    const initialValue = typeof init === "function" ? (init as () => unknown)() : init;
    stateBox.value = cast<unknown[]>(initialValue);
    const setState = (fn: unknown) => {
      if (typeof fn === "function") {
        stateBox.value = (fn as (prev: unknown[]) => unknown[])(stateBox.value);
      } else {
        stateBox.value = cast<unknown[]>(fn);
      }
    };
    return [stateBox.value, setState];
  },
  useCallback: (fn: unknown) => fn,
}));

// Import after mocks
import { useQueryHistory } from "./use-query-history";

describe("useQueryHistory", () => {
  beforeEach(() => {
    store.clear();
    stateBox.value = [];
  });

  afterEach(() => {
    store.clear();
  });

  it("initializes with empty history when no stored data", () => {
    const { history } = useQueryHistory("test-db");
    expect(history).toEqual([]);
  });

  it("initializes with stored history from localStorage", () => {
    const stored = [{ sql: "SELECT 1", timestamp: 1000 }];
    store.set("ducktails:query-history:test-db", JSON.stringify(stored));

    const { history } = useQueryHistory("test-db");
    expect(history).toEqual(stored);
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    store.set("ducktails:query-history:test-db", "not-json");

    const { history } = useQueryHistory("test-db");
    expect(history).toEqual([]);
  });

  it("addEntry adds a new query to the front and saves to localStorage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    const { addEntry } = useQueryHistory("test-db");
    addEntry("SELECT * FROM users");

    const stored = JSON.parse(store.get("ducktails:query-history:test-db") ?? "[]");
    expect(stored[0].sql).toBe("SELECT * FROM users");
    expect(stored[0].timestamp).toBe(Date.now());

    vi.useRealTimers();
  });

  it("addEntry deduplicates queries by moving to the front", () => {
    const existing = [
      { sql: "SELECT 1", timestamp: 1000 },
      { sql: "SELECT 2", timestamp: 900 },
    ];
    store.set("ducktails:query-history:test-db", JSON.stringify(existing));

    const { addEntry } = useQueryHistory("test-db");
    addEntry("SELECT 1");

    const stored = JSON.parse(store.get("ducktails:query-history:test-db") ?? "[]");
    expect(stored).toHaveLength(2);
    expect(stored[0].sql).toBe("SELECT 1");
    expect(stored[1].sql).toBe("SELECT 2");
  });

  it("addEntry limits history to MAX_HISTORY entries", () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({
      sql: `SELECT ${i}`,
      timestamp: 1000 + i,
    }));
    store.set("ducktails:query-history:test-db", JSON.stringify(existing));

    const { addEntry } = useQueryHistory("test-db");
    addEntry("SELECT new");

    const stored = JSON.parse(store.get("ducktails:query-history:test-db") ?? "[]");
    expect(stored).toHaveLength(20);
    expect(stored[0].sql).toBe("SELECT new");
  });

  it("removeEntry removes an entry by timestamp", () => {
    const existing = [
      { sql: "SELECT 1", timestamp: 1000 },
      { sql: "SELECT 2", timestamp: 2000 },
    ];
    store.set("ducktails:query-history:test-db", JSON.stringify(existing));

    const { removeEntry } = useQueryHistory("test-db");
    removeEntry(1000);

    const stored = JSON.parse(store.get("ducktails:query-history:test-db") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].sql).toBe("SELECT 2");
  });

  it("clearHistory removes all entries from state and localStorage", () => {
    store.set("ducktails:query-history:test-db", JSON.stringify([{ sql: "SELECT 1", timestamp: 1000 }]));

    const { clearHistory } = useQueryHistory("test-db");
    clearHistory();

    expect(store.has("ducktails:query-history:test-db")).toBe(false);
  });
});
