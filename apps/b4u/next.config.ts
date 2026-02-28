import { createNextConfig } from "@claudekit/ui/next-config";

export default createNextConfig({
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings", "pino", "pino-pretty", "playwright"],
});
