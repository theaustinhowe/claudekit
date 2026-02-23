import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { useMemo, useState } from "react";
import type { Todo } from "@/lib/todos";
import { TodoAddForm } from "./todo-add-form";
import { TodoEmptyState } from "./todo-empty-state";
import { TodoItem } from "./todo-item";

type Filter = "all" | "pending" | "completed";

interface TodoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  todos: Todo[];
  onAdd: (text: string) => void;
  onToggle: (todoId: string, resolved: boolean) => void;
  onEdit: (todoId: string, text: string) => void;
  onDelete: (todoId: string) => void;
  onClearCompleted: () => void;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
];

export function TodoSheet({
  open,
  onOpenChange,
  appName,
  todos,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
  onClearCompleted,
}: TodoSheetProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const completedCount = useMemo(() => todos.filter((t) => t.resolved).length, [todos]);
  const pendingCount = todos.length - completedCount;
  const totalCount = todos.length;

  const filtered = useMemo(() => {
    if (filter === "pending") return todos.filter((t) => !t.resolved);
    if (filter === "completed") return todos.filter((t) => t.resolved);
    return todos;
  }, [todos, filter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {appName} Todos
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs font-normal tabular-nums">
                {pendingCount} pending
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Filter + clear row */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between shrink-0 -mx-6 px-6 pb-3 border-b border-border">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-colors",
                    filter === f.value
                      ? "bg-background text-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
        )}

        <SheetBody className="flex-1 overflow-y-auto">
          {totalCount === 0 ? (
            <TodoEmptyState />
          ) : filtered.length === 0 ? (
            <TodoEmptyState filtered />
          ) : (
            <div className="py-2">
              {filtered.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={(resolved) => onToggle(todo.id, resolved)}
                  onEdit={(text) => onEdit(todo.id, text)}
                  onDelete={() => onDelete(todo.id)}
                />
              ))}
            </div>
          )}
        </SheetBody>

        <SheetFooter className="flex-col sm:flex-col sm:space-x-0">
          <TodoAddForm onAdd={onAdd} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
