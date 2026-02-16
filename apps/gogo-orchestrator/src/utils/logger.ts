import { createServiceLogger as createChild, createLogger } from "@devkit/logger";

export const logger = createLogger({ app: "gogo-orchestrator" });
export const createServiceLogger = (service: string) => createChild(logger, service);
