/**
 * ISO internal audit loop — one agent, all enabled standards.
 * Reads control maps (not ISO prose). Append-only run log. Report is a projection.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isoInternalAuditRunSchema,
  type IsoAuditOverall,
  type IsoAuditPriority,
  type IsoAuditVerdict,
  type IsoInternalAuditFinding,
  type IsoInternalAuditRun,
  type IsoInternalAuditSummary,
} from "../../schemas/iso-internal-audit.js";
import type { ControlGapRow } from "../../schemas/control-framework.js";
import {
  computeControlGaps,
  getControlMapPath,
  listEffectiveControls,
  loadControlMapForStandard,
  loadCoreBindingsForStandard,
} from "./control-framework.js";
import { findIsoCatalogEntry, listIsoCatalogEntries } from "./iso-catalog.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";
import { getClock, getIdGenerator } from "./runtime-context.js";
import { getTenantId, tenantDataPath } from "./tenant.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";
import { getDocsDir, writeMarkdownReport, writeTrackedFile } from "./utils.js";

export const ISO_INTERNAL_AUDIT_LOG_REL = "data/compliance/iso-internal-audit.jsonl";

export function isoInternalAuditLogPath(): string {
  const fromEnv = process.env.ORGOS_ISO_AUDIT_LOG?.trim();
  if (fromEnv) {
    mkdirSync(dirname(fromEnv), { recursive: true });
    return fromEnv;
  }
  return tenantDataPath("compliance", "iso-internal-audit.jsonl");
}

export function isoInternalAuditLatestReportPath(): string {
  return join(getDocsDir(), "audit", "internal", "latest-iso-audit.md");
}

function enabledStandards(filter?: string): string[] {
  const enabled = loadEnabledIsoIds();
  if (!filter) return enabled;
  return enabled.filter((id) => id === filter);
}

function gapsByControl(gaps: ControlGapRow[]): Map<string, ControlGapRow[]> {
  const map = new Map<string, ControlGapRow[]>();
  for (const gap of gaps) {
    const list = map.get(gap.control_id) ?? [];
    list.push(gap);
    map.set(gap.control_id, list);
  }
  return map;
}

function pickVerdict(gaps: ControlGapRow[]): {
  verdict: Extract<IsoAuditVerdict, "conform" | "observation" | "nonconformity">;
  gap?: ControlGapRow;
} {
  if (gaps.length === 0) return { verdict: "conform" };
  const nc = gaps.find(
    (g) =>
      g.gap_type === "doc_missing" ||
      g.gap_type === "maturity_below_target" ||
      g.gap_type === "reg_not_effective"
  );
  if (nc) return { verdict: "nonconformity", gap: nc };
  return { verdict: "observation", gap: gaps[0] };
}

function improvementFor(gap: ControlGapRow | undefined, evidencePaths: string[]): string {
  if (!gap) return "現行の証拠パスを維持し、次回ランで再確認する。";
  const paths = evidencePaths.join(" · ") || "(パス未設定)";
  switch (gap.gap_type) {
    case "maturity_below_target":
      return `成熟度を目標まで上げ、運用記録を ${paths} に残す。`;
    case "doc_missing":
      return `証拠ファイルを用意する: ${paths}`;
    case "evidence_stale":
      return "最終レビューから1年超。記録を見直して last_reviewed を更新する。";
    case "reg_not_effective":
      return gap.detail;
    default:
      return gap.detail;
  }
}

function summarize(findings: IsoInternalAuditFinding[]): IsoInternalAuditSummary {
  const summary: IsoInternalAuditSummary = {
    total: findings.length,
    conform: 0,
    observation: 0,
    nonconformity: 0,
    map_missing: 0,
  };
  for (const f of findings) {
    summary[f.verdict] += 1;
  }
  return summary;
}

function overallFrom(summary: IsoInternalAuditSummary): IsoAuditOverall {
  if (summary.nonconformity > 0 || summary.map_missing > 0) return "nonconform";
  if (summary.observation > 0) return "conditionally_conform";
  return "conform";
}

export function evaluateIsoInternalAudit(opts: { iso?: string } = {}): IsoInternalAuditRun {
  const enabled = loadEnabledIsoIds();
  if (opts.iso && !enabled.includes(opts.iso)) {
    const findings: IsoInternalAuditFinding[] = [
      {
        priority: "P1",
        control_id: `MAP-${opts.iso}`,
        standard: opts.iso,
        clause: "standards.yaml",
        title: `${opts.iso} はテナントで無効`,
        verdict: "map_missing",
        detail: "standards.yaml で enabled: true になっていない",
        primary_agent: "internal_audit",
        improvement: `${opts.iso} を有効化するか、有効な規格で監査する。`,
      },
    ];
    const summary = summarize(findings);
    return isoInternalAuditRunSchema.parse({
      id: getIdGenerator().uniqueId("IAR"),
      timestamp: getClock().nowIso(),
      tenant: getTenantId(),
      actor: "internal_audit",
      standards: [],
      overall: overallFrom(summary),
      summary,
      findings,
    });
  }
  const standards = enabledStandards(opts.iso);
  const catalogIds = new Set(listIsoCatalogEntries().map((e) => e.id));
  const gaps = gapsByControl(computeControlGaps());
  const findings: IsoInternalAuditFinding[] = [];

  for (const standard of standards) {
    if (!catalogIds.has(standard)) {
      findings.push({
        priority: "P1",
        control_id: `MAP-${standard}`,
        standard,
        clause: "catalog",
        title: `${standard} が ISO カタログにない`,
        verdict: "map_missing",
        detail: "steward/standards/iso/catalog.yaml に id が無い",
        primary_agent: "internal_audit",
        improvement: "カタログへ規格を追加し、control-map.yaml を置く。",
      });
      continue;
    }
    if (findIsoCatalogEntry(standard)?.status === "coming_soon") {
      findings.push({
        priority: "P1",
        control_id: `MAP-${standard}`,
        standard,
        clause: "catalog",
        title: `${standard} は未提供（coming_soon）`,
        verdict: "map_missing",
        detail: "カタログ登録のみでパックが無い。監査対象にできない",
        primary_agent: "internal_audit",
        improvement: `orgos iso scaffold ${standard} でパック雛形を作り、領域統制を書く。`,
      });
      continue;
    }
    const mapPath = getControlMapPath(standard);
    const mapped = existsSync(mapPath)
      ? [...loadControlMapForStandard(standard), ...loadCoreBindingsForStandard(standard)]
      : [];
    if (mapped.length === 0) {
      findings.push({
        priority: "P1",
        control_id: `MAP-${standard}`,
        standard,
        clause: "control-map",
        title: `${standard} の機械可読マップがない`,
        verdict: "map_missing",
        detail: `${mapPath} が無い、または統制・core_bindings が 0 件`,
        primary_agent: "internal_audit",
        improvement: "core_bindings と領域統制を持つ control-map.yaml をパックに追加する。",
      });
      continue;
    }
  }

  const seen = new Set<string>();
  for (const ctrl of listEffectiveControls()) {
    if (!ctrl.in_scope) continue;
    if (opts.iso && !ctrl.iso_refs.some((r) => r.standard === opts.iso)) continue;
    if (standards.length > 0 && !ctrl.iso_refs.some((r) => standards.includes(r.standard))) {
      continue;
    }
    const matchedRef =
      (opts.iso
        ? ctrl.iso_refs.find((r) => r.standard === opts.iso)
        : ctrl.iso_refs.find((r) => standards.includes(r.standard))) ?? ctrl.iso_refs[0];
    const standard = matchedRef?.standard;
    if (!standard) continue;
    if (seen.has(ctrl.id)) continue;
    seen.add(ctrl.id);
    const ctrlGaps = gaps.get(ctrl.id) ?? [];
    const picked = pickVerdict(ctrlGaps);
    const clause = matchedRef?.clause ?? "—";
    findings.push({
      priority: ctrl.priority,
      control_id: ctrl.id,
      standard,
      clause,
      title: ctrl.title,
      verdict: picked.verdict,
      gap_type: picked.gap?.gap_type,
      detail:
        picked.verdict === "conform"
          ? `証拠・成熟度は目標 ${ctrl.target_maturity} に対し ${ctrl.tenant_maturity}`
          : (picked.gap?.detail ?? "ギャップあり"),
      primary_agent: ctrl.primary_agent,
      improvement: improvementFor(picked.gap, ctrl.evidence_paths),
    });
  }

  const summary = summarize(findings);
  return isoInternalAuditRunSchema.parse({
    id: getIdGenerator().uniqueId("IAR"),
    timestamp: getClock().nowIso(),
    tenant: getTenantId(),
    actor: "internal_audit",
    standards,
    overall: overallFrom(summary),
    summary,
    findings,
  });
}

export function loadIsoInternalAuditRuns(): IsoInternalAuditRun[] {
  return loadJsonl(isoInternalAuditLogPath(), (raw) => isoInternalAuditRunSchema.parse(raw));
}

export function latestIsoInternalAuditRun(): IsoInternalAuditRun | undefined {
  const runs = loadIsoInternalAuditRuns();
  return runs.at(-1);
}

export function persistIsoInternalAuditRun(
  run: IsoInternalAuditRun,
  opts: { writeReports?: boolean } = {}
): { logPath: string; reportPaths: string[] } {
  const logPath = isoInternalAuditLogPath();
  appendJsonl(logPath, run);
  const reportPaths: string[] = [];
  if (opts.writeReports !== false) {
    const previous = loadIsoInternalAuditRuns().at(-2);
    const md = formatIsoInternalAuditReport(run, previous);
    const date = run.timestamp.slice(0, 10);
    reportPaths.push(
      writeMarkdownReport(
        "agent-summaries/internal-audit",
        `iso-audit-${date}-${run.id}.md`,
        md
      )
    );
    const latest = isoInternalAuditLatestReportPath();
    mkdirSync(dirname(latest), { recursive: true });
    reportPaths.push(writeTrackedFile(latest, md));
  }
  return { logPath, reportPaths };
}

export function formatIsoInternalAuditReport(
  run: IsoInternalAuditRun,
  previous?: IsoInternalAuditRun
): string {
  const s = run.summary;
  const overallJa =
    run.overall === "conform"
      ? "適合"
      : run.overall === "conditionally_conform"
        ? "条件付き適合"
        : "不適合";
  const byStandard = new Map<string, IsoInternalAuditFinding[]>();
  for (const f of run.findings) {
    const list = byStandard.get(f.standard) ?? [];
    list.push(f);
    byStandard.set(f.standard, list);
  }

  const problems = run.findings.filter((f) => f.verdict === "nonconformity");
  const issues = run.findings.filter(
    (f) => f.verdict === "observation" || f.verdict === "map_missing"
  );
  const improvements = run.findings.filter((f) => f.verdict !== "conform");

  const lines = [
    `# ISO 内部監査レポート — ${run.id}`,
    "",
    `**日時:** ${run.timestamp}`,
    `**テナント:** ${run.tenant}`,
    `**実施:** ${run.actor}（決定論検査 · 人間署名ではない）`,
    `**対象規格:** ${run.standards.join(", ") || "（有効 ISO なし）"}`,
    "",
    "## 現状",
    "",
    `| 総合 | 検査件数 | 適合 | 観察 | 不適合 | マップ欠落 |`,
    `|------|----------|------|------|--------|------------|`,
    `| ${overallJa} | ${s.total} | ${s.conform} | ${s.observation} | ${s.nonconformity} | ${s.map_missing} |`,
    "",
  ];

  if (previous) {
    lines.push(
      `前回 ${previous.id}（${previous.timestamp.slice(0, 10)}）総合 ${previous.overall} · 不適合 ${previous.summary.nonconformity} 件。`,
      ""
    );
  }

  lines.push("## 適合状況（規格別）", "");
  lines.push("| 規格 | 件数 | 適合 | 観察 | 不適合 | マップ欠落 |");
  lines.push("|------|------|------|------|--------|------------|");
  for (const [std, list] of [...byStandard.entries()].sort()) {
    const c = {
      conform: list.filter((f) => f.verdict === "conform").length,
      observation: list.filter((f) => f.verdict === "observation").length,
      nonconformity: list.filter((f) => f.verdict === "nonconformity").length,
      map_missing: list.filter((f) => f.verdict === "map_missing").length,
    };
    lines.push(
      `| ${std} | ${list.length} | ${c.conform} | ${c.observation} | ${c.nonconformity} | ${c.map_missing} |`
    );
  }
  lines.push("");

  lines.push("## 問題点", "");
  if (problems.length === 0) {
    lines.push("不適合なし。", "");
  } else {
    lines.push("| CTL | 規格 | 内容 | 担当 |");
    lines.push("|-----|------|------|------|");
    for (const f of problems) {
      lines.push(`| ${f.control_id} | ${f.standard} ${f.clause} | ${f.detail} | ${f.primary_agent} |`);
    }
    lines.push("");
  }

  lines.push("## 課題", "");
  if (issues.length === 0) {
    lines.push("観察・マップ欠落なし。", "");
  } else {
    lines.push("| CTL | 種別 | 内容 |");
    lines.push("|-----|------|------|");
    for (const f of issues) {
      lines.push(`| ${f.control_id} | ${f.verdict} | ${f.detail} |`);
    }
    lines.push("");
  }

  lines.push("## 改善提案", "");
  if (improvements.length === 0) {
    lines.push("追加の是正は不要。次回ランで維持を確認する。", "");
  } else {
    const ordered = [...improvements].sort(
      (a, b) => a.priority.localeCompare(b.priority) || a.control_id.localeCompare(b.control_id),
    );
    for (const f of ordered) {
      lines.push(`- **${f.priority} ${f.control_id}**（${f.title}）: ${f.improvement}`);
    }
    lines.push(
      "",
      "P1 は人の安全・法令上の要求で待てないもの、P2 は他が依存する土台、P3 は改善・報告。",
    );
    lines.push("");
  }

  lines.push("## 注記", "");
  lines.push(
    "- 本レポートは control-map と証拠パスの決定論検査である。ISO 公式本文の都度解釈ではない。",
    "- 条項番号はパックが持つ対応表であり、既定では未検証。状態は `orgos iso clauses` で確認する。",
    "- 認定機関の証明書は出さない。署名は人間が行う。",
    `- 監査ログ: \`${ISO_INTERNAL_AUDIT_LOG_REL}\``,
    ""
  );
  return lines.join("\n");
}

export function runIsoInternalAudit(opts: {
  iso?: string;
  persist?: boolean;
  writeReports?: boolean;
} = {}): {
  run: IsoInternalAuditRun;
  logPath?: string;
  reportPaths: string[];
} {
  const run = evaluateIsoInternalAudit({ iso: opts.iso });
  if (opts.persist === false) {
    return { run, reportPaths: [] };
  }
  const { logPath, reportPaths } = persistIsoInternalAuditRun(run, {
    writeReports: opts.writeReports,
  });
  return { run, logPath, reportPaths };
}
