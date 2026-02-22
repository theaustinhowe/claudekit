import { execSync } from "node:child_process";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const appsWithDbReset = ["gadget", "gogo-orchestrator", "b4u", "inside"];

console.log(`\n${BOLD}Resetting databases...${RESET}\n`);

for (const app of appsWithDbReset) {
  console.log(`${CYAN}[${app}]${RESET} Running db:reset...`);
  try {
    execSync(`pnpm --filter ${app} db:reset`, {
      stdio: "inherit",
      cwd: import.meta.dirname ? `${import.meta.dirname}/..` : process.cwd(),
    });
    console.log(`${GREEN}[${app}]${RESET} Done\n`);
  } catch {
    console.error(`${RED}[${app}]${RESET} Failed\n`);
  }
}

console.log(`${BOLD}${GREEN}Database reset complete.${RESET}\n`);
