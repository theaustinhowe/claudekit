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
  const body = (await req.json()) as { id?: string; resolved?: boolean };
  if (!body.id || typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: "id and resolved are required" }, { status: 400 });
  }

  const todos = readTodos(app);
  const todo = todos.find((t) => t.id === body.id);
  if (!todo) {
    return NextResponse.json({ error: "todo not found" }, { status: 404 });
  }

  todo.resolved = body.resolved;
  writeTodos(app, todos);
  return NextResponse.json(todo);
}
