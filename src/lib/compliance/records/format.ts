import type { IsoRecordReport } from "./spec.js";

export function formatRecordReports(reports: IsoRecordReport[]): string {
  if (reports.length === 0) return "記録仕様（records.yaml）が定義されていません。";

  const lines = ["# 記録の内容検査", ""];
  const errors = reports.reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === "error").length,
    0
  );
  const warnings = reports.reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === "warning").length,
    0
  );
  lines.push(`**記録:** ${reports.length} 件 · 不備 ${errors} 件 · 警告 ${warnings} 件`, "");

  lines.push("| 記録 | 行数 | 不備 | 警告 |");
  lines.push("|------|------|------|------|");
  for (const r of reports) {
    const e = r.issues.filter((i) => i.severity === "error").length;
    const w = r.issues.filter((i) => i.severity === "warning").length;
    lines.push(`| ${r.file} | ${r.exists ? r.rows : "—"} | ${e} | ${w} |`);
  }

  const withIssues = reports.filter((r) => r.issues.length > 0);
  if (withIssues.length > 0) {
    lines.push("", "## 内容", "");
    for (const r of withIssues) {
      lines.push(`### ${r.file} — ${r.title}`, "");
      for (const issue of r.issues) {
        const mark = issue.severity === "error" ? "✗" : "△";
        const where = issue.row ? `${issue.row}行目: ` : "";
        lines.push(`- ${mark} ${where}${issue.message}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
