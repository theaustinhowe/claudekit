import { createServiceLogger as createChild, createLogger } from "@devkit/logger";

const logger = createLogger({ app: "inside" });
export const createServiceLogger = (service: string) => createChild(logger, service);
