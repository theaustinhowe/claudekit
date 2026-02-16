import type { ConceptType, McpServerList, McpServerListEntry } from "@/lib/types";
import type { DiscoveredConcept } from "./concept-scanner";

/**
 * Built-in curated list of popular MCP servers.
 */
export function getCuratedMcpServers(): McpServerListEntry[] {
  return [
    {
      name: "filesystem",
      description: "Read, write, and manage files on the local filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      tags: ["files", "core"],
    },
    {
      name: "github",
      description: "Interact with GitHub repositories, issues, and pull requests",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      tags: ["git", "collaboration"],
    },
    {
      name: "postgres",
      description: "Query and manage PostgreSQL databases",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost:5432/mydb"],
      tags: ["database", "sql"],
    },
    {
      name: "sqlite",
      description: "Query and manage SQLite databases",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/db.sqlite"],
      tags: ["database", "sql"],
    },
    {
      name: "fetch",
      description: "Fetch and process web content from URLs",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
      tags: ["web", "http"],
    },
    {
      name: "brave-search",
      description: "Web search using the Brave Search API",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      env: { BRAVE_API_KEY: "" },
      tags: ["search", "web"],
    },
    {
      name: "puppeteer",
      description: "Browser automation and web scraping with Puppeteer",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      tags: ["browser", "automation"],
    },
    {
      name: "memory",
      description: "Persistent memory and knowledge graph for AI assistants",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      tags: ["memory", "knowledge"],
    },
    {
      name: "sequential-thinking",
      description: "Step-by-step reasoning and problem decomposition",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      tags: ["reasoning", "thinking"],
    },
    {
      name: "slack",
      description: "Send and manage Slack messages and channels",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
      env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
      tags: ["communication", "collaboration"],
    },
    {
      name: "sentry",
      description: "Access Sentry error tracking and performance data",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sentry"],
      env: { SENTRY_AUTH_TOKEN: "" },
      tags: ["monitoring", "errors"],
    },
    {
      name: "linear",
      description: "Manage Linear issues, projects, and teams",
      command: "npx",
      args: ["-y", "mcp-linear"],
      env: { LINEAR_API_KEY: "" },
      tags: ["project-management", "issues"],
    },
    {
      name: "context7",
      description: "Up-to-date documentation for any library via Context7",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp@latest"],
      tags: ["documentation", "libraries"],
    },
    {
      name: "supabase",
      description: "Manage Supabase projects, databases, and edge functions",
      command: "npx",
      args: ["-y", "@supabase/mcp-server-supabase@latest"],
      env: { SUPABASE_ACCESS_TOKEN: "" },
      tags: ["database", "backend"],
    },
    // Developer Tools & Cloud
    {
      name: "playwright",
      description: "Browser automation via accessibility snapshots",
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-playwright"],
      tags: ["browser", "testing"],
    },
    {
      name: "docker",
      description: "Container management and orchestration",
      command: "npx",
      args: ["-y", "@docker/mcp-server"],
      tags: ["containers", "devops"],
    },
    {
      name: "cloudflare",
      description: "Workers, KV, R2, D1 management",
      command: "npx",
      args: ["-y", "@cloudflare/mcp-server-cloudflare"],
      tags: ["cloud", "serverless"],
    },
    {
      name: "vercel",
      description: "Deploy and manage Vercel projects",
      command: "npx",
      args: ["-y", "@vercel/mcp"],
      tags: ["deployment", "cloud"],
    },
    {
      name: "prisma",
      description: "ORM schema and database management",
      command: "npx",
      args: ["-y", "@prisma/mcp-server"],
      tags: ["database", "orm"],
    },
    // Databases & Data
    {
      name: "neon",
      description: "Serverless Postgres management",
      command: "npx",
      args: ["-y", "@neondatabase/mcp-server-neon"],
      tags: ["database", "serverless"],
    },
    {
      name: "turso",
      description: "Managed SQLite/libSQL edge database",
      command: "npx",
      args: ["-y", "@turso/mcp-server"],
      tags: ["database", "edge"],
    },
    {
      name: "upstash",
      description: "Serverless Redis and Kafka",
      command: "npx",
      args: ["-y", "@upstash/mcp-server"],
      tags: ["database", "cache"],
    },
    {
      name: "redis",
      description: "Redis cache and data store operations",
      command: "npx",
      args: ["-y", "@redis/mcp-server"],
      tags: ["database", "cache"],
    },
    {
      name: "mongodb",
      description: "MongoDB database operations",
      command: "npx",
      args: ["-y", "mongodb-mcp-server"],
      tags: ["database", "nosql"],
    },
    // Web & Search
    {
      name: "firecrawl",
      description: "Web scraping to clean markdown for LLMs",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: { FIRECRAWL_API_KEY: "" },
      tags: ["scraping", "web"],
    },
    {
      name: "exa",
      description: "AI-native web search",
      command: "npx",
      args: ["-y", "exa-mcp-server"],
      env: { EXA_API_KEY: "" },
      tags: ["search", "ai"],
    },
    {
      name: "tavily",
      description: "AI-optimized search engine",
      command: "npx",
      args: ["-y", "tavily-mcp"],
      env: { TAVILY_API_KEY: "" },
      tags: ["search", "ai"],
    },
    // Communication & Productivity
    {
      name: "notion",
      description: "Search, read, and update Notion pages",
      command: "npx",
      args: ["-y", "@notionhq/mcp-server-notion"],
      env: { NOTION_API_KEY: "" },
      tags: ["productivity", "docs"],
    },
    {
      name: "google-drive",
      description: "Access Google Drive files",
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-google-drive"],
      tags: ["files", "google"],
    },
    {
      name: "google-maps",
      description: "Places, directions, and geocoding",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-google-maps"],
      env: { GOOGLE_MAPS_API_KEY: "" },
      tags: ["maps", "location"],
    },
    {
      name: "resend",
      description: "Send transactional emails",
      command: "npx",
      args: ["-y", "@resend/mcp"],
      env: { RESEND_API_KEY: "" },
      tags: ["email", "communication"],
    },
    // Observability & Monitoring
    {
      name: "grafana",
      description: "Dashboards, alerting, and observability",
      command: "npx",
      args: ["-y", "@grafana/mcp-server"],
      tags: ["monitoring", "observability"],
    },
    {
      name: "axiom",
      description: "Log management and analytics",
      command: "npx",
      args: ["-y", "@axiomhq/mcp-server"],
      env: { AXIOM_API_TOKEN: "" },
      tags: ["logging", "observability"],
    },
    {
      name: "raygun",
      description: "Error tracking and crash reporting",
      command: "npx",
      args: ["-y", "@raygun/mcp-server"],
      env: { RAYGUN_API_KEY: "" },
      tags: ["monitoring", "errors"],
    },
    // Payments & SaaS
    {
      name: "stripe",
      description: "Payments, customers, and invoices",
      command: "npx",
      args: ["-y", "@stripe/mcp"],
      env: { STRIPE_API_KEY: "" },
      tags: ["payments", "api"],
    },
    {
      name: "val-town",
      description: "Run serverless JavaScript functions",
      command: "npx",
      args: ["-y", "@valtown/mcp-server"],
      tags: ["serverless", "functions"],
    },
    // AI-specific
    {
      name: "replicate",
      description: "Run ML models via Replicate",
      command: "npx",
      args: ["-y", "@replicate/mcp-server"],
      env: { REPLICATE_API_TOKEN: "" },
      tags: ["ai", "models"],
    },
    // Version Control
    {
      name: "gitlab",
      description: "GitLab repos, merge requests, and issues",
      command: "npx",
      args: ["-y", "@gitlab/mcp-server"],
      env: { GITLAB_TOKEN: "" },
      tags: ["git", "collaboration"],
    },
  ];
}

/**
 * Fetch and parse an external MCP server list from a URL.
 */
export async function fetchMcpServerList(url: string): Promise<McpServerList> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch MCP list: ${res.status}`);

  const data = (await res.json()) as McpServerList;
  if (!data.servers || !Array.isArray(data.servers)) {
    throw new Error("Invalid MCP server list format: missing servers array");
  }

  return data;
}

/**
 * Convert MCP server list entries into DiscoveredConcepts for DB storage.
 */
export function mcpListEntriesToConcepts(entries: McpServerListEntry[]): DiscoveredConcept[] {
  return entries.map((entry) => {
    const config: Record<string, unknown> = {};
    if (entry.command) config.command = entry.command;
    if (entry.args) config.args = entry.args;
    if (entry.env) config.env = entry.env;
    if (entry.url) config.url = entry.url;

    return {
      concept_type: "mcp_server" as ConceptType,
      name: entry.name,
      description: entry.description || `MCP Server: ${entry.name}`,
      relative_path: `.mcp.json#${entry.name}`,
      content: JSON.stringify({ [entry.name]: config }, null, 2),
      metadata: {
        server_name: entry.name,
        config,
        tags: entry.tags || [],
        url: entry.url,
      },
    };
  });
}
