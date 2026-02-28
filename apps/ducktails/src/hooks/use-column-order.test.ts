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

import { useColumnOrder } from "./use-column-order";

describe("useColumnOrder", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.clear();
  });

  it("returns allColumns in original order when no stored order", () => {
    const { orderedColumns } = useColumnOrder("db1", "users", ["id", "name", "email"]);
    expect(orderedColumns).toEqual(["id", "name", "email"]);
  });

  it("returns columns in stored order", () => {
    store.set("ducktails:column-order:db1:users", JSON.stringify(["email", "name", "id"]));

    const { orderedColumns } = useColumnOrder("db1", "users", ["id", "name", "email"]);
    expect(orderedColumns).toEqual(["email", "name", "id"]);
  });

  it("filters out removed columns and appends new ones", () => {
    store.set("ducktails:column-order:db1:users", JSON.stringify(["email", "name", "old_col"]));

    const { orderedColumns } = useColumnOrder("db1", "users", ["id", "name", "email", "new_col"]);
    // "old_col" is filtered out, "id" and "new_col" are appended
    expect(orderedColumns).toEqual(["email", "name", "id", "new_col"]);
  });

  it("reorder moves column from one position to another", () => {
    const { reorder } = useColumnOrder("db1", "users", ["id", "name", "email"]);
    reorder(0, 2); // Move "id" from index 0 to index 2

    const stored = JSON.parse(store.get("ducktails:column-order:db1:users") ?? "[]");
    expect(stored).toEqual(["name", "email", "id"]);
  });

  it("reorder uses stored order as base when available", () => {
    store.set("ducktails:column-order:db1:users", JSON.stringify(["email", "name", "id"]));

    const { reorder } = useColumnOrder("db1", "users", ["id", "name", "email"]);
    reorder(0, 2); // Move "email" from index 0 to index 2

    const stored = JSON.parse(store.get("ducktails:column-order:db1:users") ?? "[]");
    expect(stored).toEqual(["name", "id", "email"]);
  });

  it("resetOrder removes stored order", () => {
    store.set("ducktails:column-order:db1:users", JSON.stringify(["email", "name", "id"]));

    const { resetOrder } = useColumnOrder("db1", "users", ["id", "name", "email"]);
    resetOrder();

    expect(store.has("ducktails:column-order:db1:users")).toBe(false);
  });

  it("uses unique storage keys per database and table", () => {
    useColumnOrder("db1", "users", ["id"]);
    useColumnOrder("db2", "posts", ["id"]);

    expect(localStorageMock.getItem).toHaveBeenCalledWith("ducktails:column-order:db1:users");
    expect(localStorageMock.getItem).toHaveBeenCalledWith("ducktails:column-order:db2:posts");
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    store.set("ducktails:column-order:db1:users", "not-json");

    const { orderedColumns } = useColumnOrder("db1", "users", ["id", "name"]);
    // Should fall back to original order
    expect(orderedColumns).toEqual(["id", "name"]);
  });
});
