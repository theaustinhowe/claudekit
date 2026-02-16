import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();

// --- CLI args ---
const args = process.argv.slice(2);
const coverageMode = args.includes("--coverage");
const verboseMode = args.includes("--verbose");
const filterIdx = args.indexOf("--filter");
const filterName = filterIdx !== -1 ? args[filterIdx + 1] : undefined;

// --- Discover packages with test scripts ---
interface PackageInfo {
  name: string;
  dir: string;
  filter: string;
}

function discoverTestPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];

  for (const topDir of ["packages", "apps"]) {
    const base = join(ROOT, topDir);
    if (!existsSync(base)) continue;

    for (const entry of readdirSync(base)) {
      const pkgJsonPath = join(base, entry, "package.json");
      if (!existsSync(pkgJsonPath)) continue;

      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      if (pkgJson.scripts?.test) {
        packages.push({
          name: pkgJson.name,
          dir: join(base, entry),
          filter: pkgJson.name,
        });
      }
    }
  }

  return packages;
}

// --- Run vitest for a single package ---
interface TestResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  exitCode: number;
  duration: number;
}

function runTests(pkg: PackageInfo, jsonOutputDir: string, index: number, total: number): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const jsonFile = join(jsonOutputDir, `${pkg.name.replace(/[/@]/g, "_")}.json`);

    const vitestArgs = ["--filter", pkg.filter, "test", "--"];
    vitestArgs.push("--reporter=json", `--outputFile=${jsonFile}`);

    if (coverageMode) {
      vitestArgs.push("--coverage");
    }

    // Quiet by default: show a single progress line, overwritten per package
    // Verbose: show full vitest output
    if (verboseMode) {
      vitestArgs.splice(4, 0, "--reporter=dot");
      console.log(`\n${BOLD}${CYAN}${pkg.name}${RESET} ${DIM}running...${RESET}`);
    } else {
      const progress = `${DIM}[${index + 1}/${total}]${RESET}`;
      process.stdout.write(`\r${progress} ${CYAN}${pkg.name}${RESET}${" ".repeat(40)}`);
    }

    const capturedOutput: string[] = [];

    const proc: ChildProcess = spawn("pnpm", vitestArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ROOT,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      if (verboseMode) {
        process.stdout.write(data);
      } else {
        capturedOutput.push(data.toString());
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      if (verboseMode) {
        for (const line of data.toString().split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("ERR_PNPM") && !trimmed.startsWith("WARN")) {
            console.error(`  ${line}`);
          }
        }
      } else {
        capturedOutput.push(data.toString());
      }
    });

    proc.on("exit", (code) => {
      const duration = Date.now() - startTime;
      const exitCode = code ?? 1;

      // On failure, dump captured output so user can see what went wrong
      if (exitCode !== 0 && !verboseMode) {
        console.log(`\n\n${RED}${BOLD}--- ${pkg.name} failed ---${RESET}`);
        console.log(capturedOutput.join(""));
        console.log(`${RED}${BOLD}--- end ${pkg.name} ---${RESET}\n`);
      }

      // Parse JSON results
      let passed = 0;
      let failed = 0;
      let skipped = 0;

      if (existsSync(jsonFile)) {
        try {
          const json = JSON.parse(readFileSync(jsonFile, "utf-8"));
          passed = json.numPassedTests ?? 0;
          failed = json.numFailedTests ?? 0;
          skipped = (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0);
        } catch {
          // JSON parse failed — rely on exit code
        }
      }

      // If no JSON but exit code 0, mark as passed with unknown count
      if (passed === 0 && failed === 0 && exitCode === 0) {
        passed = -1; // sentinel: tests passed but count unknown
      }

      resolve({ name: pkg.name, passed, failed, skipped, exitCode, duration });
    });
  });
}

// --- Coverage parsing (Istanbul format) ---
interface IstanbulFileCoverage {
  s: Record<string, number>;
  b: Record<string, number[]>;
  f: Record<string, number>;
  statementMap: Record<string, unknown>;
}

interface CoverageStats {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

function parseCoverage(pkgDir: string): CoverageStats | null {
  const coverageFile = join(pkgDir, "coverage", "coverage-final.json");
  if (!existsSync(coverageFile)) return null;

  try {
    const data = JSON.parse(readFileSync(coverageFile, "utf-8"));
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalLines = 0;
    let coveredLines = 0;

    for (const file of Object.values(data) as IstanbulFileCoverage[]) {
      const s = file.s ?? {};
      const b = file.b ?? {};
      const f = file.f ?? {};

      // Statements
      for (const count of Object.values(s)) {
        totalStatements++;
        if (count > 0) coveredStatements++;
      }

      // Branches
      for (const counts of Object.values(b)) {
        for (const count of counts) {
          totalBranches++;
          if (count > 0) coveredBranches++;
        }
      }

      // Functions
      for (const count of Object.values(f)) {
        totalFunctions++;
        if (count > 0) coveredFunctions++;
      }

      // Lines — derive from statementMap + s
      const stmtMap = file.statementMap ?? {};
      const lineSet = new Set<number>();
      const coveredLineSet = new Set<number>();
      for (const [key, mapping] of Object.entries(stmtMap)) {
        const line = (mapping as { start?: { line?: number } }).start?.line;
        if (line != null) {
          lineSet.add(line);
          if ((s[key] ?? 0) > 0) coveredLineSet.add(line);
        }
      }
      totalLines += lineSet.size;
      coveredLines += coveredLineSet.size;
    }

    return {
      statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 100,
      branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100,
      functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 100,
      lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 100,
    };
  } catch {
    return null;
  }
}

// --- Formatting helpers ---
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires matching control characters
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function pad(str: string, len: number): string {
  const visible = str.replace(ANSI_RE, "");
  return str + " ".repeat(Math.max(0, len - visible.length));
}

function rpad(str: string, len: number): string {
  const visible = str.replace(ANSI_RE, "");
  return " ".repeat(Math.max(0, len - visible.length)) + str;
}

function colorPct(pct: number): string {
  const str = `${pct.toFixed(1)}%`;
  if (pct >= 80) return `${GREEN}${str}${RESET}`;
  if (pct >= 50) return `${YELLOW}${str}${RESET}`;
  return `${RED}${str}${RESET}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// --- Main ---
async function main() {
  const allPackages = discoverTestPackages();

  const packages = filterName
    ? allPackages.filter((p) => p.name.includes(filterName) || p.dir.includes(filterName))
    : allPackages;

  if (packages.length === 0) {
    console.error(`${RED}No packages found${filterName ? ` matching "${filterName}"` : ""}.${RESET}`);
    process.exit(1);
  }

  const jsonDir = join(tmpdir(), `devkit-test-${Date.now()}`);
  mkdirSync(jsonDir, { recursive: true });

  console.log(
    `\n${BOLD}Running tests for ${packages.length} package${packages.length === 1 ? "" : "s"}${coverageMode ? " with coverage" : ""}...${RESET}`,
  );

  // Run sequentially to keep output readable
  const results: TestResult[] = [];
  for (const pkg of packages) {
    const result = await runTests(pkg, jsonDir);
    results.push(result);
  }

  // --- Summary table ---
  const COL_NAME = 28;
  const COL_NUM = 8;

  console.log(`\n${BOLD}${"─".repeat(68)}${RESET}`);
  console.log(
    `${BOLD}${pad("Package", COL_NAME)} ${rpad("Tests", COL_NUM)} ${rpad("Pass", COL_NUM)} ${rpad("Fail", COL_NUM)} ${rpad("Time", COL_NUM)}  Status${RESET}`,
  );
  console.log(`${DIM}${"─".repeat(68)}${RESET}`);

  let totalTests = 0;
  let totalPass = 0;
  let totalFail = 0;
  let anyFailed = false;

  for (const r of results) {
    const status = r.exitCode === 0 ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    if (r.exitCode !== 0) anyFailed = true;

    const tests = r.passed === -1 ? "?" : String(r.passed + r.failed + r.skipped);
    const pass = r.passed === -1 ? "?" : String(r.passed);
    const fail = String(r.failed);
    const time = formatDuration(r.duration);

    if (r.passed !== -1) {
      totalTests += r.passed + r.failed + r.skipped;
      totalPass += r.passed;
    }
    totalFail += r.failed;

    console.log(
      `${pad(r.name, COL_NAME)} ${rpad(tests, COL_NUM)} ${rpad(pass, COL_NUM)} ${rpad(fail, COL_NUM)} ${rpad(time, COL_NUM)}  ${status}`,
    );
  }

  console.log(`${DIM}${"─".repeat(68)}${RESET}`);
  const totalStatus = anyFailed ? `${RED}FAIL${RESET}` : `${GREEN}PASS${RESET}`;
  const totalTime = formatDuration(results.reduce((sum, r) => sum + r.duration, 0));
  console.log(
    `${BOLD}${pad("Total", COL_NAME)} ${rpad(String(totalTests), COL_NUM)} ${rpad(String(totalPass), COL_NUM)} ${rpad(String(totalFail), COL_NUM)} ${rpad(totalTime, COL_NUM)}  ${totalStatus}${RESET}`,
  );

  // --- Coverage table ---
  if (coverageMode) {
    const coverageResults: { name: string; stats: CoverageStats }[] = [];

    for (const pkg of packages) {
      const stats = parseCoverage(pkg.dir);
      if (stats) {
        coverageResults.push({ name: pkg.name, stats });
      }
    }

    if (coverageResults.length > 0) {
      const COL_PCT = 10;
      console.log(`\n${BOLD}${"─".repeat(68)}${RESET}`);
      console.log(
        `${BOLD}${pad("Coverage", COL_NAME)} ${rpad("Stmts", COL_PCT)} ${rpad("Branch", COL_PCT)} ${rpad("Funcs", COL_PCT)} ${rpad("Lines", COL_PCT)}${RESET}`,
      );
      console.log(`${DIM}${"─".repeat(68)}${RESET}`);

      for (const { name, stats } of coverageResults) {
        console.log(
          `${pad(name, COL_NAME)} ${rpad(colorPct(stats.statements), COL_PCT)} ${rpad(colorPct(stats.branches), COL_PCT)} ${rpad(colorPct(stats.functions), COL_PCT)} ${rpad(colorPct(stats.lines), COL_PCT)}`,
        );
      }
      console.log(`${DIM}${"─".repeat(68)}${RESET}`);
    }
  }

  console.log();
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
