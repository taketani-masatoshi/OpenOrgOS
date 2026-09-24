import type {
  IsoInternalAuditFinding,
  IsoInternalAuditRun,
} from "../../../../schemas/iso-internal-audit.js";
import { ISO_INTERNAL_AUDIT_LOG_REL } from "./internal-audit-store.js";

function describeOtherGaps(finding: IsoInternalAuditFinding): string {
  if (finding.other_gaps.length === 0) return "—";
  return finding.other_gaps.map((gap) => `${gap.gap_type}: ${gap.detail}`).join(" · ");
}

function overviewSection(run: IsoInternalAuditRun, previous?: IsoInternalAuditRun): string[] {
  const overall =
    run.overall === "conform"
      ? "適合"
      : run.overall === "conditionally_conform"
        ? "条件付き適合"
        : "不適合";
  const summary = run.summary;
  const lines = [
    `# ISO 適合性の事前検査 — ${run.id}`,
    "",
    `**日時:** ${run.timestamp}`,
    `**テナント:** ${run.tenant}`,
    `**実施:** ${run.actor}（決定論検査 · 人間署名ではない）`,
    "**位置づけ:** 本検査は ISO 19011 の内部監査ではない。証拠の存在と記録の仕様適合を機械的に確認するもので、" +
      "要求事項ごとの判定は `orgos iso audit plan create` 以降で監査員が行う。",
    `**対象規格:** ${run.standards.join(", ") || "（有効 ISO なし）"}`,
    "",
    "## 現状",
    "",
    "| 総合 | 検査件数 | 適合 | 観察 | 不適合 | マップ欠落 |",
    "|------|----------|------|------|--------|------------|",
    `| ${overall} | ${summary.total} | ${summary.conform} | ${summary.observation} | ${summary.nonconformity} | ${summary.map_missing} |`,
    "",
  ];
  if (previous) {
    lines.push(
      `前回 ${previous.id}（${previous.timestamp.slice(0, 10)}）総合 ${previous.overall} · 不適合 ${previous.summary.nonconformity} 件。`,
      ""
    );
  }
  return lines;
}

function standardsSection(findings: IsoInternalAuditFinding[]): string[] {
  const grouped = new Map<string, IsoInternalAuditFinding[]>();
  for (const finding of findings) {
    grouped.set(finding.standard, [...(grouped.get(finding.standard) ?? []), finding]);
  }
  const lines = [
    "## 適合状況（規格別）",
    "",
    "| 規格 | 件数 | 適合 | 観察 | 不適合 | マップ欠落 |",
    "|------|------|------|------|--------|------------|",
  ];
  for (const [standard, items] of [...grouped.entries()].sort()) {
    const count = (verdict: IsoInternalAuditFinding["verdict"]) =>
      items.filter((finding) => finding.verdict === verdict).length;
    lines.push(
      `| ${standard} | ${items.length} | ${count("conform")} | ${count("observation")} | ${count("nonconformity")} | ${count("map_missing")} |`
    );
  }
  return [...lines, ""];
}

function problemsSection(findings: IsoInternalAuditFinding[]): string[] {
  const problems = findings.filter((finding) => finding.verdict === "nonconformity");
  if (problems.length === 0) return ["## 問題点", "", "不適合なし。", ""];
  return [
    "## 問題点",
    "",
    "| CTL | 規格 | 内容 | 併記 | 担当 |",
    "|-----|------|------|------|------|",
    ...problems.map(
      (finding) =>
        `| ${finding.control_id} | ${finding.standard} ${finding.clause} | ${finding.detail} | ${describeOtherGaps(finding)} | ${finding.primary_agent} |`
    ),
    "",
  ];
}

function issuesSection(findings: IsoInternalAuditFinding[]): string[] {
  const issues = findings.filter(
    (finding) => finding.verdict === "observation" || finding.verdict === "map_missing"
  );
  if (issues.length === 0) return ["## 課題", "", "観察・マップ欠落なし。", ""];
  return [
    "## 課題",
    "",
    "| CTL | 種別 | 内容 | 併記 |",
    "|-----|------|------|------|",
    ...issues.map(
      (finding) =>
        `| ${finding.control_id} | ${finding.verdict} | ${finding.detail} | ${describeOtherGaps(finding)} |`
    ),
    "",
  ];
}

function improvementsSection(findings: IsoInternalAuditFinding[]): string[] {
  const improvements = findings
    .filter((finding) => finding.verdict !== "conform")
    .sort(
      (left, right) =>
        left.priority.localeCompare(right.priority) ||
        left.control_id.localeCompare(right.control_id)
    );
  if (improvements.length === 0) {
    return ["## 改善提案", "", "追加の是正は不要。次回ランで維持を確認する。", ""];
  }
  return [
    "## 改善提案",
    "",
    ...improvements.map(
      (finding) =>
        `- **${finding.priority} ${finding.control_id}**（${finding.title}）: ${finding.improvement}`
    ),
    "",
    "P1 は人の安全・法令上の要求で待てないもの、P2 は他が依存する土台、P3 は改善・報告。",
    "",
  ];
}

function notesSection(): string[] {
  return [
    "## 注記",
    "",
    "- 本レポートは control-map と証拠パスの決定論検査である。ISO 公式本文の都度解釈ではない。",
    "- 条項番号はパックが持つ対応表であり、既定では未検証。状態は `orgos iso clauses` で確認する。",
    "- 認定機関の証明書は出さない。署名は人間が行う。",
    `- 監査ログ: \`${ISO_INTERNAL_AUDIT_LOG_REL}\``,
    "",
  ];
}

export function formatIsoInternalAuditReport(
  run: IsoInternalAuditRun,
  previous?: IsoInternalAuditRun
): string {
  return [
    ...overviewSection(run, previous),
    ...standardsSection(run.findings),
    ...problemsSection(run.findings),
    ...issuesSection(run.findings),
    ...improvementsSection(run.findings),
    ...notesSection(),
  ].join("\n");
}
