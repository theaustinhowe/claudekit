export function buildAnalyzeProjectPrompt(projectPath: string): string {
  return `You are analyzing a web application codebase at: ${projectPath}

Scan the project structure and provide a comprehensive analysis. Use Read, Glob, and Grep tools to examine the codebase.

Your output MUST be valid JSON with this exact structure:
{
  "name": "Project Name (from package.json or directory name)",
  "framework": "Framework name and version (e.g., Next.js 14 App Router)",
  "directories": ["list", "of", "key", "directories"],
  "auth": "Authentication method detected (e.g., NextAuth, Clerk, none)",
  "database": "Database/ORM detected (e.g., Prisma + PostgreSQL, none)",
  "routes": [
    { "path": "/route-path", "title": "Human readable title", "authRequired": true, "description": "What this route does" }
  ],
  "summary": "Brief 1-2 sentence description of what this app does"
}

Steps:
1. Read package.json for project name, dependencies, and scripts
2. Glob for routing patterns (app/*/page.tsx, pages/*.tsx, src/routes/*, etc.)
3. Check for auth configuration files (auth.ts, [...nextauth], clerk config, etc.)
4. Check for database config (prisma/schema.prisma, drizzle.config.ts, etc.)
5. Identify key directories (src/, app/, components/, lib/, etc.)
6. Map all user-facing routes with their purpose

Return ONLY the JSON object, no markdown fencing or explanation.`;
}
