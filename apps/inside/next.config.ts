import { securityHeaders } from "@claudekit/ui/next-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "@claudekit/playwright",
    "playwright",
    "pino",
    "pino-pretty",
  ],
  headers: async () => securityHeaders(),
};

export default nextConfig;
