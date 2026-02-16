import type { Metadata } from "next";
import { ScanWizard } from "@/components/scans/scan-wizard";
import { getPolicies } from "@/lib/actions/policies";
import { getRepos } from "@/lib/actions/repos";
import { getScanRoots } from "@/lib/actions/scans";

export const metadata: Metadata = { title: "New Scan" };

export default async function NewScanPage() {
  const [policies, repos, scanRoots] = await Promise.all([getPolicies(), getRepos(), getScanRoots()]);

  return <ScanWizard policies={policies} repos={repos} savedScanRoots={scanRoots} />;
}
