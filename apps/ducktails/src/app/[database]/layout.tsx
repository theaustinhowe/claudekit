import { notFound } from "next/navigation";
import { getDatabaseEntry } from "@/lib/db/registry";

export default async function DatabaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ database: string }>;
}) {
  const { database } = await params;
  const entry = getDatabaseEntry(database);
  if (!entry) notFound();
  return <>{children}</>;
}
