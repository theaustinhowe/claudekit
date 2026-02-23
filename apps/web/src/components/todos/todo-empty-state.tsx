import { CheckSquare, ListFilter } from "lucide-react";

export function TodoEmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      {filtered ? (
        <>
          <ListFilter className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">No matching todos</p>
        </>
      ) : (
        <>
          <CheckSquare className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">No todos yet</p>
          <p className="text-xs mt-1">Add one below to get started</p>
        </>
      )}
    </div>
  );
}
