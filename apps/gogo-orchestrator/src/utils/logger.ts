import { createLogger, createServiceLogger as _createServiceLogger } from "@devkit/logger";

export const logger = createLogger({ app: "gogo-orchestrator" });

export function createServiceLogger(service: string) {
  return _createServiceLogger(logger, service);
}
