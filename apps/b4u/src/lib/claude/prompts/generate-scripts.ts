export function buildGenerateScriptsPrompt(projectContext: {
  name: string;
  framework: string;
  flows: Array<{ id: string; name: string; steps: string[] }>;
  routes: Array<{ path: string; title: string; description: string }>;
}): string {
  return `You are writing step-by-step demo scripts for recording a walkthrough video of "${projectContext.name}".

Available routes: ${JSON.stringify(projectContext.routes, null, 2)}
User flows to script: ${JSON.stringify(projectContext.flows, null, 2)}

For each flow, create a detailed step-by-step script that a browser automation tool can follow.

Your output MUST be valid JSON:
{
  "scripts": [
    {
      "flowId": "flow-id",
      "flowName": "Flow Name",
      "steps": [
        {
          "id": "unique-step-id",
          "stepNumber": 1,
          "url": "/route-path",
          "action": "Specific action to perform (e.g., Click the 'Sign Up' button, Type 'john@example.com' in the email field)",
          "expectedOutcome": "What should happen (e.g., Modal opens with registration form)",
          "duration": "3s"
        }
      ]
    }
  ]
}

Guidelines:
- Each step should be a single, clear action
- Actions should be specific enough for automation: "Click X button", "Type Y in Z field", "Wait for A to appear"
- Expected outcomes describe visual changes
- Duration is how long to hold on this step for the video (2s-5s typically)
- 4-8 steps per flow
- Step IDs should be short and unique (e.g., "o1", "p3", "b2")

Return ONLY the JSON object.`;
}
