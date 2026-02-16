export function buildGenerateDataPlanPrompt(projectContext: {
  name: string;
  framework: string;
  auth: string;
  database: string;
  routes: Array<{ path: string; title: string }>;
  flows: Array<{ id: string; name: string; steps: string[] }>;
}): string {
  return `You are planning mock data and environment setup for recording a demo of "${projectContext.name}".

Project context:
- Framework: ${projectContext.framework}
- Auth: ${projectContext.auth}
- Database: ${projectContext.database}
- Routes: ${JSON.stringify(projectContext.routes.map((r) => r.path))}
- User flows: ${JSON.stringify(projectContext.flows.map((f) => ({ name: f.name, steps: f.steps })))}

Generate a plan for what mock data, auth overrides, and environment configuration are needed.

Your output MUST be valid JSON:
{
  "entities": [
    { "name": "Entity Name", "count": 5, "note": "Description of what to seed" }
  ],
  "authOverrides": [
    { "id": "kebab-case-id", "label": "Human readable description", "enabled": true }
  ],
  "envItems": [
    { "id": "kebab-case-id", "label": "Human readable description", "enabled": true }
  ]
}

Guidelines:
- Include entities that would make the UI look populated and realistic
- Auth overrides should bypass login/verification for smooth recording
- Env items should disable rate limiting, analytics, external services
- Use realistic counts (3-25 items per entity)
- 3-6 auth overrides, 3-6 env items, 4-8 entities

Return ONLY the JSON object.`;
}
