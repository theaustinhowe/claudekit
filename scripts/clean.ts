import { existsSync, globSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const root = resolve(import.meta.dirname ?? process.cwd(), "..");

const patterns = [
  "apps/*/.next",
  "apps/*/dist",
  "apps/*/build",
  "apps/*/out",
  "packages/*/dist",
  "apps/*/.turbo",
  "packages/*/.turbo",
  ".turbo",
];

console.log(`\n${BOLD}Cleaning cache directories...${RESET}\n`);

let cleaned = 0;

for (const pattern of patterns) {
  const matches = globSync(pattern, { cwd: root });
  for (const match of matches) {
    const full = resolve(root, match);
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
      console.log(`  ${GREEN}removed${RESET} ${DIM}${match}${RESET}`);
      cleaned++;
    }
  }
}

// Also clean *.tsbuildinfo files
const tsBuildInfoFiles = globSync("{apps,packages}/**/*.tsbuildinfo", { cwd: root });
for (const file of tsBuildInfoFiles) {
  const full = resolve(root, file);
  if (existsSync(full)) {
    rmSync(full);
    console.log(`  ${GREEN}removed${RESET} ${DIM}${file}${RESET}`);
    cleaned++;
  }
}

if (cleaned === 0) {
  console.log("  Nothing to clean.");
}

console.log(`\n${BOLD}${GREEN}Done.${RESET} Removed ${cleaned} item${cleaned !== 1 ? "s" : ""}.\n`);
