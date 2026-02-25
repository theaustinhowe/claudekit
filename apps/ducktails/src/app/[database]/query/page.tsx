import { notFound } from "next/navigation";
import { getDatabaseEntry } from "@/lib/db/registry";
import { QueryClient } from "./query-client";

export default async function QueryPage({ params }: { params: Promise<{ database: string }> }) {
  const { database } = await params;
  const entry = getDatabaseEntry(database);
  if (!entry) notFound();

  return <QueryClient databaseId={entry.id} databaseName={entry.name} />;
}
