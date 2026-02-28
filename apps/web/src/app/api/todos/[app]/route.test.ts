import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/todos", () => ({
  readTodos: vi.fn(),
  writeTodos: vi.fn(),
}));

import { readTodos, writeTodos } from "@/lib/todos";
import { DELETE, GET, PATCH, POST } from "./route";

const mockReadTodos = vi.mocked(readTodos);
const mockWriteTodos = vi.mocked(writeTodos);

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(appName: string, method: string, body?: unknown) {
  const url = `http://localhost:2000/api/todos/${appName}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const req = new Request(url, init);
  const params = Promise.resolve({ app: appName });
  return { req, params };
}

describe("GET /api/todos/[app]", () => {
  it("returns todos for an app", async () => {
    const todos = [{ id: "1", text: "Fix bug", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    mockReadTodos.mockReturnValue(todos);

    const { req, params } = buildRequest("gadget", "GET");
    const response = await GET(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(todos);
    expect(mockReadTodos).toHaveBeenCalledWith("gadget");
  });

  it("returns empty array when no todos exist", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "GET");
    const response = await GET(cast(req), { params });
    const data = await response.json();

    expect(data).toEqual([]);
  });
});

describe("POST /api/todos/[app]", () => {
  it("creates a new todo", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "POST", { text: "Write tests" });
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.text).toBe("Write tests");
    expect(data.resolved).toBe(false);
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(mockWriteTodos).toHaveBeenCalledWith("gadget", [expect.objectContaining({ text: "Write tests" })]);
  });

  it("trims whitespace from text", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "POST", { text: "  spaced text  " });
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(data.text).toBe("spaced text");
  });

  it("returns 400 when text is missing", async () => {
    const { req, params } = buildRequest("gadget", "POST", {});
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("text is required");
  });

  it("returns 400 when text is empty string", async () => {
    const { req, params } = buildRequest("gadget", "POST", { text: "" });
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("text is required");
  });

  it("returns 400 when text is whitespace only", async () => {
    const { req, params } = buildRequest("gadget", "POST", { text: "   " });
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("text is required");
  });

  it("returns 400 when text is not a string", async () => {
    const { req, params } = buildRequest("gadget", "POST", { text: 123 });
    const response = await POST(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("text is required");
  });
});

describe("PATCH /api/todos/[app]", () => {
  it("updates resolved status", async () => {
    const todos = [{ id: "abc", text: "Do thing", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    mockReadTodos.mockReturnValue(todos);

    const { req, params } = buildRequest("gadget", "PATCH", { id: "abc", resolved: true });
    const response = await PATCH(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.resolved).toBe(true);
    expect(mockWriteTodos).toHaveBeenCalled();
  });

  it("updates text", async () => {
    const todos = [{ id: "abc", text: "Old text", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" }];
    mockReadTodos.mockReturnValue(todos);

    const { req, params } = buildRequest("gadget", "PATCH", { id: "abc", text: "New text" });
    const response = await PATCH(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe("New text");
    expect(data.updatedAt).toBeDefined();
  });

  it("returns 400 when id is missing", async () => {
    const { req, params } = buildRequest("gadget", "PATCH", { resolved: true });
    const response = await PATCH(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("id is required");
  });

  it("returns 400 when neither resolved nor text is provided", async () => {
    const { req, params } = buildRequest("gadget", "PATCH", { id: "abc" });
    const response = await PATCH(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("resolved or text is required");
  });

  it("returns 404 when todo is not found", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "PATCH", { id: "nonexistent", resolved: true });
    const response = await PATCH(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("todo not found");
  });
});

describe("DELETE /api/todos/[app]", () => {
  it("deletes a todo by id", async () => {
    const todos = [
      { id: "a", text: "First", resolved: false, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", text: "Second", resolved: false, createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    mockReadTodos.mockReturnValue(todos);

    const { req, params } = buildRequest("gadget", "DELETE", { id: "a" });
    const response = await DELETE(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockWriteTodos).toHaveBeenCalledWith("gadget", [expect.objectContaining({ id: "b" })]);
  });

  it("clears completed todos", async () => {
    const todos = [
      { id: "a", text: "Done", resolved: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", text: "Not done", resolved: false, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", text: "Also done", resolved: true, createdAt: "2026-01-03T00:00:00.000Z" },
    ];
    mockReadTodos.mockReturnValue(todos);

    const { req, params } = buildRequest("gadget", "DELETE", { clearCompleted: true });
    const response = await DELETE(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("b");
    expect(mockWriteTodos).toHaveBeenCalledWith("gadget", [expect.objectContaining({ id: "b" })]);
  });

  it("returns 400 when neither id nor clearCompleted is provided", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "DELETE", {});
    const response = await DELETE(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("id or clearCompleted is required");
  });

  it("returns 404 when todo to delete is not found", async () => {
    mockReadTodos.mockReturnValue([]);

    const { req, params } = buildRequest("gadget", "DELETE", { id: "nonexistent" });
    const response = await DELETE(cast(req), { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("todo not found");
  });
});
