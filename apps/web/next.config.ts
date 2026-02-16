import { loadRootEnv } from "../../scripts/load-root-env.js";
loadRootEnv(import.meta.dirname + "/../..");

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
