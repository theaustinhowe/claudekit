import { createServiceLogger as _createServiceLogger, createLogger } from "@devkit/logger";

export const logger = createLogger({ app: "gogo-orchestrator" });

export function createServiceLogger(service: string) {
  return _createServiceLogger(logger, service);
}
