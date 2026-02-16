import { createServiceLogger as _createServiceLogger, createLogger } from "@devkit/logger";

function getOrCreateLogger() {
  const key = "__devkit_b4u_logger__";
  const g = globalThis as Record<string, unknown>;
  if (!g[key]) {
    g[key] = createLogger({ app: "b4u" });
  }
  return g[key] as ReturnType<typeof createLogger>;
}

export const logger = getOrCreateLogger();

export function createServiceLogger(service: string) {
  return _createServiceLogger(logger, service);
}
