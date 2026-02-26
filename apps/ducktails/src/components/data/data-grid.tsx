"use client";

import { Button } from "@claudekit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@claudekit/ui/components/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@claudekit/ui/components/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ColumnFilter, ColumnInfo, DataPage, FilterOperator } from "@/lib/types";
import { formatCellValue } from "@/lib/utils";
import { ColumnFilterRow } from "./column-filter-row";

export function DataGrid({
  data,
  onSort,
  onEdit,
  onDelete,
  onRowClick,
  isPending,
  visibleColumns,
  columnOrder,
  onColumnReorder,
  filters,
  onFilterChange,
}: {
  data: DataPage;
  onSort: (column: string) => void;
  onEdit?: (row: Record<string, unknown>) => void;
  onDelete?: (row: Record<string, unknown>) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
  isPending?: boolean;
  visibleColumns?: string[];
  columnOrder?: string[];
  onColumnReorder?: (from: number, to: number) => void;
  filters?: ColumnFilter[];
  onFilterChange?: (column: string, operator: FilterOperator, value?: string) => void;
}) {
  const hasActions = onEdit || onDelete;

  // Filter columns to only visible ones
  let columns: ColumnInfo[] = visibleColumns
    ? data.columns.filter((c) => visibleColumns.includes(c.column_name))
    : data.columns;

  // Sort by column order
  if (columnOrder && columnOrder.length > 0) {
    const orderMap = new Map(columnOrder.map((name, i) => [name, i]));
    columns = [...columns].sort((a, b) => {
      const ai = orderMap.get(a.column_name) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap.get(b.column_name) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }

  // Filter the active filters to only visible columns
  const visibleFilters = filters
    ? visibleColumns
      ? filters.filter((f) => visibleColumns.includes(f.column))
      : filters
    : [];

  // ── Drag state ──────────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex && onColumnReorder) {
      onColumnReorder(dragIndex, targetIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={isPending ? "opacity-50 pointer-events-none" : ""}>
      <Table>
        <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
          <TableRow className="hover:bg-transparent">
            {columns.map((col, colIdx) => (
              <TableHead
                key={col.column_name}
                className={`whitespace-nowrap h-8 text-xs ${
                  onColumnReorder ? "cursor-grab active:cursor-grabbing" : ""
                } ${dragIndex === colIdx ? "opacity-40" : ""} ${
                  dragOverIndex === colIdx && dragIndex !== colIdx ? "border-l-2 border-l-primary" : ""
                }`}
                draggable={!!onColumnReorder}
                onDragStart={(e) => handleDragStart(e, colIdx)}
                onDragOver={(e) => handleDragOver(e, colIdx)}
                onDrop={() => handleDrop(colIdx)}
                onDragEnd={handleDragEnd}
              >
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
          {onFilterChange && (
            <ColumnFilterRow
              columns={columns}
              filters={visibleFilters}
              onFilterChange={onFilterChange}
              hasActions={!!hasActions}
            />
          )}
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (hasActions ? 1 : 0)}
                className="text-center py-12 text-muted-foreground text-sm"
              >
                No data
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((row, idx) => (
              <TableRow
                // biome-ignore lint/suspicious/noArrayIndexKey: rows don't have stable IDs
                key={idx}
                className={`group ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => {
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
                    <TooltipProvider>
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                          {onEdit && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(row);
                              }}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(row);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipProvider>
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
