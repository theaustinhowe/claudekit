import { type NextRequest, NextResponse } from "next/server";
import { execute, executePrepared, query } from "@/lib/db";
import { flowScriptsArraySchema, parseBody } from "@/lib/validations";

export async function GET() {
  try {
    const flows = await query<{
      flow_id: string;
      flow_name: string;
    }>("SELECT flow_id, flow_name FROM flow_scripts ORDER BY id");

    const steps = await query<{
      id: string;
      flow_id: string;
      step_number: number;
      url: string;
      action: string;
      expected_outcome: string;
      duration: string;
    }>(
      "SELECT id, flow_id, step_number, url, action, expected_outcome, duration FROM script_steps ORDER BY flow_id, step_number",
    );

    const result = flows.map((f) => ({
      flowId: f.flow_id,
      flowName: f.flow_name,
      steps: steps
        .filter((s) => s.flow_id === f.flow_id)
        .map((s) => ({
          id: s.id,
          stepNumber: s.step_number,
          url: s.url,
          action: s.action,
          expectedOutcome: s.expected_outcome,
          duration: s.duration,
        })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch flow scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const parsed = await parseBody(request, flowScriptsArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const flowScripts = parsed.data;

  try {
    await execute("DELETE FROM script_steps");

    for (const flow of flowScripts) {
      for (const step of flow.steps) {
        await executePrepared(
          "INSERT INTO script_steps (id, flow_id, step_number, url, action, expected_outcome, duration) VALUES ($id, $flowId, $stepNum, $url, $action, $outcome, $duration)",
          {
            $id: step.id,
            $flowId: flow.flowId,
            $stepNum: step.stepNumber,
            $url: step.url,
            $action: step.action,
            $outcome: step.expectedOutcome,
            $duration: step.duration,
          },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update flow scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
