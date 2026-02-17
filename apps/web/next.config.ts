import { securityHeaders } from "@devkit/ui/next-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty"],
  headers: async () => securityHeaders(),
};

export default nextConfig;
