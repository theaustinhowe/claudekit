import { createServiceLogger as createChild, createLogger } from "@claudekit/logger";

export const logger = createLogger({ app: "gogo-orchestrator" });
export const createServiceLogger = (service: string) => createChild(logger, service);
