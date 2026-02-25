import { notFound } from "next/navigation";
import { getTableData } from "@/lib/actions/data";
import { getTablePrimaryKey, getTableSchema } from "@/lib/actions/tables";
import { getDatabaseEntry } from "@/lib/db/registry";
import { TableDetailClient } from "./table-detail-client";

export default async function TableDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ database: string; table: string }>;
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>;
}) {
  const { database, table } = await params;
  const { page, sort, dir } = await searchParams;

  const entry = getDatabaseEntry(database);
  if (!entry) notFound();

  const pageNum = page ? Number.parseInt(page, 10) : 1;

  const [schema, primaryKey, data] = await Promise.all([
    getTableSchema(database, table),
    getTablePrimaryKey(database, table),
    getTableData(database, table, {
      page: pageNum,
      pageSize: 50,
      sortColumn: sort,
      sortDirection: dir === "desc" ? "desc" : "asc",
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
    />
  );
}
