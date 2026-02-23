import { cn } from "@claudekit/ui";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Input } from "@claudekit/ui/components/input";
import { Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Todo } from "@/lib/todos";

interface TodoItemProps {
  todo: Todo;
  onToggle: (resolved: boolean) => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}

export function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      // requestAnimationFrame to win any focus races (e.g. dropdown restore)
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  // Sync editText when todo.text changes externally
  useEffect(() => {
    if (!editing) setEditText(todo.text);
  }, [todo.text, editing]);

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onEdit(trimmed);
    } else {
      setEditText(todo.text);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditText(todo.text);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const startEditing = () => {
    setEditText(todo.text);
    setEditing(true);
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors">
      <Checkbox checked={todo.resolved} onCheckedChange={(checked) => onToggle(checked === true)} />
      {editing ? (
        <Input
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm flex-1"
        />
      ) : (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to edit is a progressive enhancement, pencil button is the primary affordance */}
          <span
            className={cn("flex-1 cursor-text select-none", todo.resolved && "line-through text-muted-foreground")}
            onDoubleClick={startEditing}
          >
            {todo.text}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={startEditing}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
