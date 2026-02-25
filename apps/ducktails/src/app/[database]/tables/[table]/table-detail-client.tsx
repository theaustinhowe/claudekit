"use client";

import { Button } from "@claudekit/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { ChevronLeft, ChevronRight, Columns3, Plus, RefreshCw, Rows3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DataGrid } from "@/components/data/data-grid";
import { DeleteConfirmDialog } from "@/components/data/delete-confirm-dialog";
import { RowEditDialog } from "@/components/data/row-edit-dialog";
import { RefreshedAt } from "@/components/refreshed-at";
import { ColumnSchemaTable } from "@/components/tables/column-schema-table";
import { deleteRow, insertRow, updateRow } from "@/lib/actions/data";
import { refreshSnapshots } from "@/lib/actions/databases";
import type { ColumnInfo, DataPage } from "@/lib/types";

export function TableDetailClient({
  databaseId,
  tableName,
  schema,
  primaryKey,
  initialData,
  refreshedAt,
}: {
  databaseId: string;
  tableName: string;
  schema: ColumnInfo[];
  primaryKey: string[];
  initialData: DataPage;
  refreshedAt: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [showInsert, setShowInsert] = useState(false);

  const totalPages = Math.ceil(initialData.totalRows / initialData.pageSize);

  const navigate = (params: URLSearchParams) => {
    startTransition(() => {
      router.push(`/${databaseId}/tables/${tableName}?${params.toString()}`);
    });
  };

  const handleSort = (column: string) => {
    const newDir = initialData.sortColumn === column && initialData.sortDirection === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    params.set("sort", column);
    params.set("dir", newDir);
    params.set("page", "1");
    navigate(params);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams();
    if (initialData.sortColumn) params.set("sort", initialData.sortColumn);
    if (initialData.sortDirection) params.set("dir", initialData.sortDirection);
    params.set("page", String(page));
    navigate(params);
  };

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
          <RefreshedAt timestamp={refreshedAt} />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRefresh} disabled={isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          </Button>
          {primaryKey.length > 0 && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowInsert(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Insert
            </Button>
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
            isPending={isPending}
          />
        </TabsContent>

        <TabsContent value="schema" className="flex-1 m-0 overflow-auto p-4">
          <ColumnSchemaTable columns={schema} primaryKey={primaryKey} />
        </TabsContent>
      </Tabs>

      <RowEditDialog
        open={showInsert}
        onOpenChange={setShowInsert}
        columns={schema}
        onSave={handleInsert}
        title="Insert Row"
      />

      <RowEditDialog
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
