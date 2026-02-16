import { type NextRequest, NextResponse } from "next/server";
import { generateProject } from "@/lib/services/generator";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { templateId, policyId, intent, projectName, projectPath, packageManager, features, gitInit } = body;

  if (!templateId || !projectName || !projectPath) {
    return NextResponse.json(
      { error: "Missing required fields: templateId, projectName, projectPath" },
      { status: 400 },
    );
  }

  const result = await generateProject({
    templateId,
    policyId,
    intent: intent || "",
    projectName,
    projectPath,
    packageManager: packageManager || "pnpm",
    features: features || [],
    gitInit: gitInit ?? true,
  });

  if (result.success) {
    return NextResponse.json(result);
  } else {
    return NextResponse.json(result, { status: 500 });
  }
}
