import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings", "pino", "pino-pretty"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
      ],
    },
  ],
};

export default nextConfig;
