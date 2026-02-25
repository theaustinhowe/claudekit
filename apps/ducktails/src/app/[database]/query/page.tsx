import { notFound } from "next/navigation";
import { getSchemaForCompletion } from "@/lib/actions/tables";
import { getDatabaseEntry } from "@/lib/db/registry";
import { QueryClient } from "./query-client";

export default async function QueryPage({ params }: { params: Promise<{ database: string }> }) {
  const { database } = await params;
  const entry = getDatabaseEntry(database);
  if (!entry) notFound();

  let schema: Record<string, string[]> = {};
  try {
    schema = await getSchemaForCompletion(entry.id);
  } catch {
    // Degrade to empty autocomplete if database is unavailable
  }

  return <QueryClient databaseId={entry.id} databaseName={entry.name} schema={schema} />;
}
