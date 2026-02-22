import { createServiceLogger as createChild, createLogger } from "@claudekit/logger";

const logger = createLogger({ app: "gadget" });
export const createServiceLogger = (service: string) => createChild(logger, service);
