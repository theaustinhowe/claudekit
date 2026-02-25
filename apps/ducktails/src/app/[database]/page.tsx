import { redirect } from "next/navigation";

export default async function DatabasePage({ params }: { params: Promise<{ database: string }> }) {
  const { database } = await params;
  redirect(`/${database}/tables`);
}
