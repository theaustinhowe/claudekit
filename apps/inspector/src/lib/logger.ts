import { createServiceLogger as createChild, createLogger } from "@claudekit/logger";

const logger = createLogger({ app: "inspector" });
export const createServiceLogger = (service: string) => createChild(logger, service);
