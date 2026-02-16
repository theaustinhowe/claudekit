import { createServiceLogger as _createServiceLogger, createLogger } from "@devkit/logger";

export const logger = createLogger({ app: "gadget" });

export function createServiceLogger(service: string) {
  return _createServiceLogger(logger, service);
}
