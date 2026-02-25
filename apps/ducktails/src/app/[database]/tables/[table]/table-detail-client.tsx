"use client";

import { Button } from "@claudekit/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ChevronLeft, ChevronRight, Columns3, Plus, RefreshCw, Rows3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ColumnPicker } from "@/components/data/column-picker";
import { DataGrid } from "@/components/data/data-grid";
import { DeleteConfirmDialog } from "@/components/data/delete-confirm-dialog";
import { RowEditSheet } from "@/components/data/row-edit-sheet";
import { RefreshedAt } from "@/components/refreshed-at";
import { ColumnSchemaTable } from "@/components/tables/column-schema-table";
import { useColumnOrder } from "@/hooks/use-column-order";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { deleteRow, insertRow, updateRow } from "@/lib/actions/data";
import { refreshSnapshots } from "@/lib/actions/databases";
import type { ColumnFilter, ColumnInfo, DataPage, FilterOperator } from "@/lib/types";

/** Build URLSearchParams preserving sort + filter state */
function buildParams(
  sort: { column?: string; direction?: string },
  filters: ColumnFilter[],
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (sort.column) params.set("sort", sort.column);
  if (sort.direction) params.set("dir", sort.direction);
  params.set("page", String(page));
  for (const f of filters) {
    const val = f.value !== undefined ? `${f.operator}:${f.value}` : `${f.operator}:`;
    params.set(`f_${f.column}`, val);
  }
  return params;
}

export function TableDetailClient({
  databaseId,
  tableName,
  schema,
  primaryKey,
  initialData,
  refreshedAt,
  filters = [],
}: {
  databaseId: string;
  tableName: string;
  schema: ColumnInfo[];
  primaryKey: string[];
  initialData: DataPage;
  refreshedAt: number;
  filters?: ColumnFilter[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [showInsert, setShowInsert] = useState(false);

  const allColumnNames = useMemo(() => schema.map((c) => c.column_name), [schema]);
  const { hiddenColumns, visibleColumns, toggleColumn, showAll } = useColumnVisibility(
    databaseId,
    tableName,
    allColumnNames,
  );
  const { orderedColumns, reorder } = useColumnOrder(databaseId, tableName, allColumnNames);

  const totalPages = Math.ceil(initialData.totalRows / initialData.pageSize);

  const navigate = (params: URLSearchParams) => {
    startTransition(() => {
      router.push(`/${databaseId}/tables/${tableName}?${params.toString()}`);
    });
  };

  const currentSort = useMemo(
    () => ({ column: initialData.sortColumn, direction: initialData.sortDirection }),
    [initialData.sortColumn, initialData.sortDirection],
  );

  const handleSort = (column: string) => {
    const newDir = initialData.sortColumn === column && initialData.sortDirection === "asc" ? "desc" : "asc";
    navigate(buildParams({ column, direction: newDir }, filters, 1));
  };

  const handlePageChange = (page: number) => {
    navigate(buildParams(currentSort, filters, page));
  };

  const handleFilterChange = useCallback(
    (column: string, operator: FilterOperator, value?: string) => {
      // Build new filters list
      const next = filters.filter((f) => f.column !== column);
      // Only add if there's a meaningful value (or it's a valueless operator)
      const isValueless = ["is_null", "is_not_null", "is_true", "is_false"].includes(operator);
      if (isValueless || (value !== undefined && value !== "")) {
        next.push({ column, operator, value });
      }
      const params = buildParams(currentSort, next, 1); // reset to page 1
      startTransition(() => {
        router.push(`/${databaseId}/tables/${tableName}?${params.toString()}`);
      });
    },
    [filters, currentSort, databaseId, tableName, router],
  );

  const handleRefresh = () => {
    startTransition(async () => {
      await refreshSnapshots();
      router.refresh();
    });
  };

  const handleInsert = async (data: Record<string, unknown>) => {
    try {
      await insertRow(databaseId, tableName, data);
      toast.success("Row inserted");
      setShowInsert(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Insert failed");
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!editRow || primaryKey.length === 0) return;
    const pks: Record<string, unknown> = {};
    for (const k of primaryKey) pks[k] = editRow[k];
    try {
      await updateRow(databaseId, tableName, pks, data);
      toast.success("Row updated");
      setEditRow(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || primaryKey.length === 0) return;
    const pks: Record<string, unknown> = {};
    for (const k of primaryKey) pks[k] = deleteTarget[k];
    try {
      await deleteRow(databaseId, tableName, pks);
      toast.success("Row deleted");
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold font-mono text-sm">{tableName}</h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {initialData.totalRows.toLocaleString()} rows
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            allColumns={allColumnNames}
            hiddenColumns={hiddenColumns}
            onToggle={toggleColumn}
            onShowAll={showAll}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRefresh} disabled={isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <RefreshedAt timestamp={refreshedAt} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {primaryKey.length > 0 ? (
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowInsert(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Insert
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Read-only (no primary key)</span>
          )}
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="data" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between border-b px-4 shrink-0">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="data"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 text-xs"
            >
              <Rows3 className="h-3.5 w-3.5 mr-1.5" />
              Data
            </TabsTrigger>
            <TabsTrigger
              value="schema"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 text-xs"
            >
              <Columns3 className="h-3.5 w-3.5 mr-1.5" />
              Schema
            </TabsTrigger>
          </TabsList>

          {/* Inline pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {initialData.page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={initialData.page <= 1}
                onClick={() => handlePageChange(initialData.page - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={initialData.page >= totalPages}
                onClick={() => handlePageChange(initialData.page + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="data" className="flex-1 m-0 overflow-auto">
          <DataGrid
            data={initialData}
            onSort={handleSort}
            onEdit={primaryKey.length > 0 ? setEditRow : undefined}
            onDelete={primaryKey.length > 0 ? setDeleteTarget : undefined}
            onRowClick={primaryKey.length > 0 ? setEditRow : undefined}
            isPending={isPending}
            visibleColumns={visibleColumns}
            columnOrder={orderedColumns}
            onColumnReorder={reorder}
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </TabsContent>

        <TabsContent value="schema" className="flex-1 m-0 overflow-auto p-4">
          <ColumnSchemaTable columns={schema} primaryKey={primaryKey} />
        </TabsContent>
      </Tabs>

      <RowEditSheet
        open={showInsert}
        onOpenChange={setShowInsert}
        columns={schema}
        onSave={handleInsert}
        title="Insert Row"
      />

      <RowEditSheet
        open={!!editRow}
        onOpenChange={(open) => !open && setEditRow(null)}
        columns={schema}
        initialValues={editRow ?? undefined}
        onSave={handleUpdate}
        title="Edit Row"
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
