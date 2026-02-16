import type { Metadata } from "next";
import { ReposClient } from "@/components/repos/repos-client";
import { getRepos } from "@/lib/actions/repos";

export const metadata: Metadata = { title: "Repositories" };

export default async function RepositoriesPage() {
  const repos = await getRepos();

  return <ReposClient repos={repos} />;
}
