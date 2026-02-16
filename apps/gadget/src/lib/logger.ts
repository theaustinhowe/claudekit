import { createServiceLogger as createChild, createLogger } from "@devkit/logger";

export const logger = createLogger({ app: "gadget" });
export const createServiceLogger = (service: string) => createChild(logger, service);
