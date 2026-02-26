import { Input } from "@claudekit/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Plus } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

interface TodoAddFormProps {
  onAdd: (text: string) => void;
}

export function TodoAddForm({ onAdd }: TodoAddFormProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a todo..."
        className="h-8 text-sm"
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="submit"
              disabled={!text.trim()}
              className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30"
              aria-label="Add todo"
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Add todo</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </form>
  );
}
