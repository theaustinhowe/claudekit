import { createNextConfig } from "@claudekit/ui/next-config";

export default createNextConfig({
  serverExternalPackages: ["pino", "pino-pretty"],
});
