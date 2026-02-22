import { getDb, queryAll } from "@/lib/db";
import type { Finding, FixAction, Repo } from "@/lib/types";

interface ReportData {
  scanId?: string;
  repos: Repo[];
  findings: Finding[];
  fixActions: FixAction[];
}

async function gatherReportData(scanId?: string): Promise<ReportData> {
  const db = await getDb();

  let repos: Repo[];
  let findings: Finding[];
  let fixActions: FixAction[];

  if (scanId) {
    repos = await queryAll(
      db,
      `
      SELECT r.* FROM repos r
      INNER JOIN findings f ON f.repo_id = r.id
      WHERE f.scan_id = ?
      GROUP BY r.id, r.name, r.local_path, r.git_remote, r.default_branch, r.package_manager, r.repo_type, r.is_monorepo, r.last_scanned_at, r.created_at
    `,
      [scanId],
    );

    findings = await queryAll(db, "SELECT * FROM findings WHERE scan_id = ?", [scanId]);
    fixActions = await queryAll(db, "SELECT * FROM fix_actions WHERE scan_id = ?", [scanId]);
  } else {
    repos = await queryAll(db, "SELECT * FROM repos");
    findings = await queryAll(db, "SELECT * FROM findings");
    fixActions = await queryAll(db, "SELECT * FROM fix_actions");
  }

  return { scanId, repos, findings, fixActions };
}

export async function exportJSON(scanId?: string): Promise<string> {
  const data = await gatherReportData(scanId);

  const report = {
    generated_at: new Date().toISOString(),
    scan_id: data.scanId || null,
    summary: {
      total_repos: data.repos.length,
      total_findings: data.findings.length,
      critical: data.findings.filter((f) => f.severity === "critical").length,
      warnings: data.findings.filter((f) => f.severity === "warning").length,
      info: data.findings.filter((f) => f.severity === "info").length,
      total_fixes: data.fixActions.length,
    },
    repos: data.repos.map((repo) => ({
      ...repo,
      findings: data.findings.filter((f) => f.repo_id === repo.id),
      fix_actions: data.fixActions.filter((f) => f.repo_id === repo.id),
    })),
  };

  return JSON.stringify(report, null, 2);
}

export async function exportMarkdown(scanId?: string): Promise<string> {
  const data = await gatherReportData(scanId);
  const criticalCount = data.findings.filter((f) => f.severity === "critical").length;
  const warningCount = data.findings.filter((f) => f.severity === "warning").length;
  const infoCount = data.findings.filter((f) => f.severity === "info").length;

  let md = `# Repo Auditor Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Repositories | ${data.repos.length} |\n`;
  md += `| Critical Issues | ${criticalCount} |\n`;
  md += `| Warnings | ${warningCount} |\n`;
  md += `| Info | ${infoCount} |\n`;
  md += `| Fix Actions | ${data.fixActions.length} |\n\n`;

  for (const repo of data.repos) {
    const repoFindings = data.findings.filter((f) => f.repo_id === repo.id);
    const repoFixes = data.fixActions.filter((f) => f.repo_id === repo.id);

    md += `## ${repo.name}\n\n`;
    md += `**Path:** \`${repo.local_path}\`\n\n`;

    if (repoFindings.length > 0) {
      md += `### Findings\n\n`;
      for (const finding of repoFindings) {
        const icon = finding.severity === "critical" ? "🔴" : finding.severity === "warning" ? "🟡" : "🔵";
        md += `- ${icon} **${finding.title}** (${finding.severity})\n`;
        md += `  ${finding.details}\n`;
      }
      md += `\n`;
    }

    if (repoFixes.length > 0) {
      md += `### Suggested Fixes\n\n`;
      for (const fix of repoFixes) {
        md += `- [ ] ${fix.title} (${fix.risk} risk)\n`;
      }
      md += `\n`;
    }
  }

  return md;
}

export async function exportPRDescription(scanId?: string): Promise<string> {
  const data = await gatherReportData(scanId);
  const criticalCount = data.findings.filter((f) => f.severity === "critical").length;
  const warningCount = data.findings.filter((f) => f.severity === "warning").length;

  let pr = `## Repo Auditor Fixes\n\n`;
  pr += `This PR applies automated fixes from the Repo Auditor scan.\n\n`;
  pr += `### Changes\n\n`;
  pr += `- **${data.fixActions.length}** fixes applied across **${data.repos.length}** repositories\n`;
  pr += `- **${criticalCount}** critical issues addressed\n`;
  pr += `- **${warningCount}** warnings addressed\n\n`;

  pr += `### Applied Fixes\n\n`;
  for (const fix of data.fixActions) {
    const repo = data.repos.find((r) => r.id === fix.repo_id);
    pr += `- ${fix.title}${repo ? ` (${repo.name})` : ""}\n`;
  }

  pr += `\n### Safety\n\n`;
  pr += `- ✅ Snapshot created before applying changes\n`;
  pr += `- ✅ Changes can be reverted from the Repo Auditor UI\n`;

  return pr;
}
