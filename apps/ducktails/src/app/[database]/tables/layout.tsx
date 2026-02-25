import { notFound } from "next/navigation";
import { listTables } from "@/lib/actions/tables";
import { getDatabaseEntry } from "@/lib/db/registry";
import type { TableSummary } from "@/lib/types";
import { TableSidebar } from "./table-sidebar";

export default async function TablesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ database: string }>;
}) {
  const { database } = await params;
  const entry = getDatabaseEntry(database);
  if (!entry) notFound();

  let tables: TableSummary[];
  try {
    tables = await listTables(database);
  } catch {
    tables = [];
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <TableSidebar databaseId={entry.id} databaseName={entry.name} tables={tables} />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
