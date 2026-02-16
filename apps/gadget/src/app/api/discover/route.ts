import { type NextRequest, NextResponse } from "next/server";
import { discoverRepos } from "@/lib/services/scanner";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { roots, excludePatterns } = body;

  if (!roots || !Array.isArray(roots) || !roots.every((r: unknown) => typeof r === "string")) {
    return NextResponse.json({ error: "Missing or invalid 'roots' array" }, { status: 400 });
  }

  const repos = discoverRepos({
    roots,
    excludePatterns,
  });

  return NextResponse.json({
    count: repos.length,
    repos: repos.map((r) => ({
      name: r.name,
      localPath: r.localPath,
      repoType: r.repoType,
      packageManager: r.packageManager,
      isMonorepo: r.isMonorepo,
      gitRemote: r.gitRemote,
      defaultBranch: r.defaultBranch,
    })),
  });
}
