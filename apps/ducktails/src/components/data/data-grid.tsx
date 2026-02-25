"use client";

import { Button } from "@claudekit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@claudekit/ui/components/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@claudekit/ui/components/table";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { DataPage } from "@/lib/types";
import { formatCellValue } from "@/lib/utils";

export function DataGrid({
  data,
  onSort,
  onEdit,
  onDelete,
  isPending,
}: {
  data: DataPage;
  onSort: (column: string) => void;
  onEdit?: (row: Record<string, unknown>) => void;
  onDelete?: (row: Record<string, unknown>) => void;
  isPending?: boolean;
}) {
  const hasActions = onEdit || onDelete;

  return (
    <div className={isPending ? "opacity-50 pointer-events-none" : ""}>
      <Table>
        <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
          <TableRow className="hover:bg-transparent">
            {data.columns.map((col) => (
              <TableHead key={col.column_name} className="whitespace-nowrap h-8 text-xs">
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => onSort(col.column_name)}
                >
                  {col.column_name}
                  {data.sortColumn === col.column_name ? (
                    data.sortDirection === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-20" />
                  )}
                </button>
              </TableHead>
            ))}
            {hasActions && <TableHead className="w-8 h-8" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={data.columns.length + (hasActions ? 1 : 0)}
                className="text-center py-12 text-muted-foreground text-sm"
              >
                No data
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((row, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows don't have stable IDs
              <TableRow key={idx} className="group">
                {data.columns.map((col) => {
                  const val = row[col.column_name];
                  const isNull = val === null || val === undefined;
                  return (
                    <TableCell
                      key={col.column_name}
                      className={`max-w-[300px] truncate font-mono text-xs py-1.5 ${isNull ? "text-muted-foreground/50 italic" : ""}`}
                    >
                      {formatCellValue(val)}
                    </TableCell>
                  );
                })}
                {hasActions && (
                  <TableCell className="py-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(row)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem onClick={() => onDelete(row)} className="text-destructive">
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
