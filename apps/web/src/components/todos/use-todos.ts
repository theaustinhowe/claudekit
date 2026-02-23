import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Todo } from "@/lib/todos";

export function useTodos(initialTodos: Record<string, Todo[]>) {
  const [todosByApp, setTodosByApp] = useState<Record<string, Todo[]>>(initialTodos);

  const addTodo = useCallback(async (appId: string, text: string) => {
    const optimistic: Todo = {
      id: crypto.randomUUID(),
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    setTodosByApp((prev) => ({
      ...prev,
      [appId]: [...(prev[appId] ?? []), optimistic],
    }));

    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(appId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Failed to add todo");
      const created = (await res.json()) as Todo;
      setTodosByApp((prev) => ({
        ...prev,
        [appId]: (prev[appId] ?? []).map((t) => (t.id === optimistic.id ? created : t)),
      }));
    } catch {
      setTodosByApp((prev) => ({
        ...prev,
        [appId]: (prev[appId] ?? []).filter((t) => t.id !== optimistic.id),
      }));
      toast.error("Failed to add todo");
    }
  }, []);

  const toggleTodo = useCallback(async (appId: string, todoId: string, resolved: boolean) => {
    setTodosByApp((prev) => ({
      ...prev,
      [appId]: (prev[appId] ?? []).map((t) => (t.id === todoId ? { ...t, resolved } : t)),
    }));

    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(appId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todoId, resolved }),
      });
      if (!res.ok) throw new Error("Failed to toggle todo");
    } catch {
      setTodosByApp((prev) => ({
        ...prev,
        [appId]: (prev[appId] ?? []).map((t) => (t.id === todoId ? { ...t, resolved: !resolved } : t)),
      }));
      toast.error("Failed to update todo");
    }
  }, []);

  const editTodo = useCallback(async (appId: string, todoId: string, text: string) => {
    let previousText = "";
    setTodosByApp((prev) => ({
      ...prev,
      [appId]: (prev[appId] ?? []).map((t) => {
        if (t.id === todoId) {
          previousText = t.text;
          return { ...t, text, updatedAt: new Date().toISOString() };
        }
        return t;
      }),
    }));

    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(appId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todoId, text }),
      });
      if (!res.ok) throw new Error("Failed to edit todo");
    } catch {
      setTodosByApp((prev) => ({
        ...prev,
        [appId]: (prev[appId] ?? []).map((t) => (t.id === todoId ? { ...t, text: previousText } : t)),
      }));
      toast.error("Failed to edit todo");
    }
  }, []);

  const deleteTodo = useCallback(async (appId: string, todoId: string) => {
    let removed: Todo | undefined;
    setTodosByApp((prev) => {
      const list = prev[appId] ?? [];
      removed = list.find((t) => t.id === todoId);
      return { ...prev, [appId]: list.filter((t) => t.id !== todoId) };
    });

    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(appId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todoId }),
      });
      if (!res.ok) throw new Error("Failed to delete todo");
    } catch {
      if (removed) {
        const item = removed;
        setTodosByApp((prev) => ({
          ...prev,
          [appId]: [...(prev[appId] ?? []), item],
        }));
      }
      toast.error("Failed to delete todo");
    }
  }, []);

  const clearCompleted = useCallback(async (appId: string) => {
    let cleared: Todo[] = [];
    setTodosByApp((prev) => {
      const list = prev[appId] ?? [];
      cleared = list.filter((t) => t.resolved);
      return { ...prev, [appId]: list.filter((t) => !t.resolved) };
    });

    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(appId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearCompleted: true }),
      });
      if (!res.ok) throw new Error("Failed to clear completed");
    } catch {
      setTodosByApp((prev) => ({
        ...prev,
        [appId]: [...(prev[appId] ?? []), ...cleared],
      }));
      toast.error("Failed to clear completed todos");
    }
  }, []);

  return { todosByApp, addTodo, toggleTodo, editTodo, deleteTodo, clearCompleted };
}
