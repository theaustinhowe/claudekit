export function buildGenerateOutlinePrompt(projectContext: {
  name: string;
  framework: string;
  routes: Array<{ path: string; title: string; authRequired: boolean; description: string }>;
  auth: string;
  database: string;
}): string {
  return `You are creating a demo outline for the web application "${projectContext.name}".

Project context:
- Framework: ${projectContext.framework}
- Auth: ${projectContext.auth}
- Database: ${projectContext.database}
- Known routes: ${JSON.stringify(projectContext.routes, null, 2)}

Generate user flows that would make a compelling demo video walkthrough. Each flow should represent a realistic user journey through the app.

Your output MUST be valid JSON:
{
  "routes": [
    { "path": "/path", "title": "Page Title", "authRequired": false, "description": "What this page does" }
  ],
  "flows": [
    {
      "id": "kebab-case-id",
      "name": "Human Readable Flow Name",
      "steps": ["/route1", "/route2", "/route3"]
    }
  ]
}

Guidelines:
- Include 3-6 user flows
- Each flow should have 2-5 route steps
- Cover the most important features: onboarding, core functionality, settings
- Start with unauthenticated flows (landing, registration) if they exist
- Progress to authenticated flows (dashboard, features, settings)
- Order flows from most fundamental to most advanced

Return ONLY the JSON object.`;
}
