import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readAllTodos, readTodos, writeTodos } from "./todos";

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readTodos", () => {
  it("returns empty array when file does not exist", () => {
    // First call: ensureDir checks TODOS_DIR existence
    // Second call: checks the specific file existence
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = readTodos("gadget");

    expect(result).toEqual([]);
  });

  it("returns parsed todos when file exists", () => {
    const todos = [{ id: "1", text: "Test", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(todos));

    const result = readTodos("gadget");

    expect(result).toEqual(todos);
  });

  it("returns empty array when file contains corrupt JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json{{{");

    const result = readTodos("gadget");

    expect(result).toEqual([]);
  });

  it("creates directory if it does not exist", () => {
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(false);

    readTodos("gadget");

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining("todos"), { recursive: true });
  });
});

describe("writeTodos", () => {
  it("writes todos to file as formatted JSON", () => {
    const todos = [{ id: "1", text: "Test", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    mockExistsSync.mockReturnValue(true);

    writeTodos("gadget", cast(todos));

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("gadget.json"),
      JSON.stringify(todos, null, 2),
    );
  });

  it("creates directory before writing if it does not exist", () => {
    mockExistsSync.mockReturnValueOnce(false);

    writeTodos("gadget", []);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining("todos"), { recursive: true });
  });
});

describe("readAllTodos", () => {
  it("reads todos for all provided app ids", () => {
    const gadgetTodos = [{ id: "1", text: "Gadget task", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    const inspectorTodos = [{ id: "2", text: "Inspector task", resolved: true, createdAt: "2026-01-02T00:00:00.000Z" }];

    // For each readTodos call: ensureDir check + file check
    mockExistsSync
      .mockReturnValueOnce(true) // gadget ensureDir
      .mockReturnValueOnce(true) // gadget file
      .mockReturnValueOnce(true) // inspector ensureDir
      .mockReturnValueOnce(true); // inspector file

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(gadgetTodos))
      .mockReturnValueOnce(JSON.stringify(inspectorTodos));

    const result = readAllTodos(["gadget", "inspector"]);

    expect(result.gadget).toEqual(gadgetTodos);
    expect(result.inspector).toEqual(inspectorTodos);
  });

  it("returns empty arrays for apps with no todos", () => {
    mockExistsSync
      .mockReturnValueOnce(true) // ensureDir
      .mockReturnValueOnce(false); // file does not exist

    const result = readAllTodos(["gadget"]);

    expect(result.gadget).toEqual([]);
  });
});
