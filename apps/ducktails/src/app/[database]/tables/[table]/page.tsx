import { notFound } from "next/navigation";
import { getTableData } from "@/lib/actions/data";
import { getTablePrimaryKey, getTableSchema } from "@/lib/actions/tables";
import { getDatabaseEntry } from "@/lib/db/registry";
import type { ColumnFilter, FilterOperator } from "@/lib/types";
import { TableDetailClient } from "./table-detail-client";

const VALID_OPERATORS = new Set<FilterOperator>([
  "contains",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_null",
  "is_not_null",
  "is_true",
  "is_false",
]);

function parseFilters(searchParams: Record<string, string | undefined>): ColumnFilter[] {
  const filters: ColumnFilter[] = [];
  for (const [key, raw] of Object.entries(searchParams)) {
    if (!key.startsWith("f_") || !raw) continue;
    const column = key.slice(2);
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) continue;
    const op = raw.slice(0, colonIdx) as FilterOperator;
    const value = raw.slice(colonIdx + 1);
    if (!VALID_OPERATORS.has(op)) continue;
    filters.push({ column, operator: op, value: value || undefined });
  }
  return filters;
}

export default async function TableDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ database: string; table: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { database, table } = await params;
  const sp = await searchParams;
  const { page, sort, dir } = sp;

  const entry = getDatabaseEntry(database);
  if (!entry) notFound();

  const pageNum = page ? Number.parseInt(page, 10) : 1;
  const filters = parseFilters(sp);

  const [schema, primaryKey, data] = await Promise.all([
    getTableSchema(database, table),
    getTablePrimaryKey(database, table),
    getTableData(database, table, {
      page: pageNum,
      pageSize: 50,
      sortColumn: sort,
      sortDirection: dir === "desc" ? "desc" : "asc",
      filters: filters.length > 0 ? filters : undefined,
    }),
  ]);

  return (
    <TableDetailClient
      databaseId={database}
      tableName={table}
      schema={schema}
      primaryKey={primaryKey}
      initialData={data}
      refreshedAt={Date.now()}
      filters={filters}
    />
  );
}
