import { securityHeaders } from "@devkit/ui/next-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings", "pino", "pino-pretty", "playwright"],
  headers: async () => securityHeaders(),
};

export default nextConfig;
