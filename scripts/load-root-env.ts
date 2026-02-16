import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadRootEnv(rootDir: string) {
  const envFile = resolve(rootDir, ".env");
  const envLocalFile = resolve(rootDir, ".env.local");
  if (existsSync(envFile)) config({ path: envFile, override: false });
  if (existsSync(envLocalFile)) config({ path: envLocalFile, override: false });
}
