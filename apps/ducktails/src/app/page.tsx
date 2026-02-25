import { listDatabases } from "@/lib/actions/databases";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const { databases, refreshedAt } = await listDatabases();
  return <DashboardClient databases={databases} refreshedAt={refreshedAt} />;
}
