import { cn } from "@claudekit/ui";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Input } from "@claudekit/ui/components/input";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
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
  const settledRef = useRef(false);

  useEffect(() => {
    if (editing) {
      settledRef.current = false;
      // Double-rAF: first frame to let React commit, second to let the
      // Sheet dialog's focus-trap finish restoring focus after the pencil
      // button was removed.  Only then do we grab focus for the input.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
          settledRef.current = true;
        });
      });
    }
  }, [editing]);

  // Sync editText when todo.text changes externally while not editing
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

  const handleBlur = () => {
    // Only save-on-blur once focus has fully settled after entering edit mode.
    // The Sheet's dialog focus-trap can cause a spurious blur during the
    // transition; ignoring it here prevents the edit from closing instantly.
    if (settledRef.current) {
      saveEdit();
    }
  };

  // Prevent save/cancel buttons from stealing input focus (which would
  // trigger handleBlur before onClick fires).
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const startEditing = () => {
    setEditText(todo.text);
    setEditing(true);
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors">
      <Checkbox checked={todo.resolved} onCheckedChange={(checked) => onToggle(checked === true)} />
      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            ref={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm flex-1"
          />
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={saveEdit}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={cancelEdit}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
