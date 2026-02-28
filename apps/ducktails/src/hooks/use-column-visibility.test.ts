import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory localStorage mock
const store = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
};

vi.stubGlobal("localStorage", localStorageMock);

// Mock React hooks to execute callbacks directly
vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => string) => getSnapshot(),
}));

import { useColumnVisibility } from "./use-column-visibility";

describe("useColumnVisibility", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.clear();
  });

  it("returns all columns as visible when no hidden columns stored", () => {
    const { visibleColumns, hiddenColumns } = useColumnVisibility("db1", "users", ["id", "name", "email"]);
    expect(visibleColumns).toEqual(["id", "name", "email"]);
    expect(hiddenColumns.size).toBe(0);
  });

  it("filters out hidden columns from visibleColumns", () => {
    store.set("ducktails:column-visibility:db1:users", JSON.stringify(["email"]));

    const { visibleColumns, hiddenColumns } = useColumnVisibility("db1", "users", ["id", "name", "email"]);
    expect(visibleColumns).toEqual(["id", "name"]);
    expect(hiddenColumns.has("email")).toBe(true);
  });

  it("toggleColumn hides a visible column", () => {
    const { toggleColumn } = useColumnVisibility("db1", "users", ["id", "name", "email"]);
    toggleColumn("email");

    const stored = JSON.parse(store.get("ducktails:column-visibility:db1:users") ?? "[]");
    expect(stored).toContain("email");
  });

  it("toggleColumn shows a hidden column", () => {
    store.set("ducktails:column-visibility:db1:users", JSON.stringify(["email"]));

    const { toggleColumn } = useColumnVisibility("db1", "users", ["id", "name", "email"]);
    toggleColumn("email");

    const stored = JSON.parse(store.get("ducktails:column-visibility:db1:users") ?? "[]");
    expect(stored).not.toContain("email");
  });

  it("toggleColumn prevents hiding all columns", () => {
    // Only one column visible (name is hidden)
    store.set("ducktails:column-visibility:db1:users", JSON.stringify(["name"]));

    const { toggleColumn } = useColumnVisibility("db1", "users", ["id", "name"]);
    toggleColumn("id"); // Try to hide the last visible column

    // Should not have hidden it
    const stored = JSON.parse(store.get("ducktails:column-visibility:db1:users") ?? "[]");
    expect(stored).not.toContain("id");
  });

  it("showAll removes all hidden columns", () => {
    store.set("ducktails:column-visibility:db1:users", JSON.stringify(["name", "email"]));

    const { showAll } = useColumnVisibility("db1", "users", ["id", "name", "email"]);
    showAll();

    expect(store.has("ducktails:column-visibility:db1:users")).toBe(false);
  });

  it("uses unique storage keys per database and table", () => {
    useColumnVisibility("db1", "users", ["id"]);
    useColumnVisibility("db2", "posts", ["id"]);

    expect(localStorageMock.getItem).toHaveBeenCalledWith("ducktails:column-visibility:db1:users");
    expect(localStorageMock.getItem).toHaveBeenCalledWith("ducktails:column-visibility:db2:posts");
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    store.set("ducktails:column-visibility:db1:users", "not-json");

    const { visibleColumns, hiddenColumns } = useColumnVisibility("db1", "users", ["id", "name"]);
    // Should fall back to showing all columns
    expect(visibleColumns).toEqual(["id", "name"]);
    expect(hiddenColumns.size).toBe(0);
  });

  it("handles multiple hidden columns correctly", () => {
    store.set("ducktails:column-visibility:db1:users", JSON.stringify(["name", "email"]));

    const { visibleColumns } = useColumnVisibility("db1", "users", ["id", "name", "email", "age"]);
    expect(visibleColumns).toEqual(["id", "age"]);
  });
});
