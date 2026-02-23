import { type NextRequest, NextResponse } from "next/server";
import { readTodos, writeTodos } from "@/lib/todos";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const todos = readTodos(app);
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const body = (await req.json()) as { text?: string };
  if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const todos = readTodos(app);
  const newTodo = {
    id: crypto.randomUUID(),
    text: body.text.trim(),
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  todos.push(newTodo);
  writeTodos(app, todos);
  return NextResponse.json(newTodo, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const body = (await req.json()) as { id?: string; resolved?: boolean; text?: string };
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (typeof body.resolved !== "boolean" && typeof body.text !== "string") {
    return NextResponse.json({ error: "resolved or text is required" }, { status: 400 });
  }

  const todos = readTodos(app);
  const todo = todos.find((t) => t.id === body.id);
  if (!todo) {
    return NextResponse.json({ error: "todo not found" }, { status: 404 });
  }

  if (typeof body.resolved === "boolean") {
    todo.resolved = body.resolved;
  }
  if (typeof body.text === "string" && body.text.trim().length > 0) {
    todo.text = body.text.trim();
    todo.updatedAt = new Date().toISOString();
  }

  writeTodos(app, todos);
  return NextResponse.json(todo);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const body = (await req.json()) as { id?: string; clearCompleted?: boolean };

  const todos = readTodos(app);

  if (body.clearCompleted) {
    const remaining = todos.filter((t) => !t.resolved);
    writeTodos(app, remaining);
    return NextResponse.json(remaining);
  }

  if (!body.id) {
    return NextResponse.json({ error: "id or clearCompleted is required" }, { status: 400 });
  }

  const index = todos.findIndex((t) => t.id === body.id);
  if (index === -1) {
    return NextResponse.json({ error: "todo not found" }, { status: 404 });
  }

  todos.splice(index, 1);
  writeTodos(app, todos);
  return NextResponse.json({ ok: true });
}
