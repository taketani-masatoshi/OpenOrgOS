import { existsSync } from "node:fs";
import {
  isoInternalAuditRunSchema,
  type IsoAuditOverall,
  type IsoAuditVerdict,
  type IsoInternalAuditFinding,
  type IsoInternalAuditRun,
  type IsoInternalAuditSummary,
} from "../../../../schemas/iso-internal-audit.js";
import type { ControlGapRow } from "../../../../schemas/control-framework.js";
import {
  computeControlGaps,
  getControlMapPath,
  listEffectiveControls,
  loadControlMapForStandard,
  loadCoreBindingsForStandard,
} from "../../control-framework.js";
import { findIsoCatalogEntry, listIsoCatalogEntries } from "../../iso-catalog.js";
import { getClock, getIdGenerator } from "../../runtime-context.js";
import { getTenantId } from "../../tenant.js";
import { loadApplicableIsoIds, loadEnabledIsoIds } from "../../tenant-standards.js";
import { persistIsoInternalAuditRun } from "./internal-audit-store.js";

export {
  ISO_INTERNAL_AUDIT_LOG_REL,
  isoInternalAuditLatestReportPath,
  isoInternalAuditLogPath,
} from "./internal-audit-store.js";

function enabledStandards(filter?: string): string[] {
  const enabled = filter ? loadEnabledIsoIds() : loadApplicableIsoIds();
  return filter ? enabled.filter((id) => id === filter) : enabled;
}

function gapsByControl(gaps: ControlGapRow[]): Map<string, ControlGapRow[]> {
  const grouped = new Map<string, ControlGapRow[]>();
  for (const gap of gaps)
    grouped.set(gap.control_id, [...(grouped.get(gap.control_id) ?? []), gap]);
  return grouped;
}

function pickVerdict(gaps: ControlGapRow[]): {
  verdict: Extract<IsoAuditVerdict, "conform" | "observation" | "nonconformity">;
  gap?: ControlGapRow;
} {
  if (gaps.length === 0) return { verdict: "conform" };
  const nonconformity = gaps.find(
    (gap) =>
      gap.gap_type === "doc_missing" ||
      gap.gap_type === "maturity_below_target" ||
      gap.gap_type === "reg_not_effective"
  );
  return nonconformity
    ? { verdict: "nonconformity", gap: nonconformity }
    : { verdict: "observation", gap: gaps[0] };
}

function improvementForGap(gap: ControlGapRow, paths: string): string {
  switch (gap.gap_type) {
    case "maturity_below_target":
      return `成熟度を目標まで上げ、運用記録を ${paths} に残す。`;
    case "doc_missing":
      return `証拠ファイルを用意する: ${paths}`;
    case "evidence_stale":
      return "最終レビューから1年超。記録を見直して last_reviewed を更新する。";
    case "record_invalid":
      return `記録の内容を仕様に合わせる: ${paths}`;
    default:
      return gap.detail;
  }
}

function improvementFor(
  gap: ControlGapRow | undefined,
  others: ControlGapRow[],
  evidencePaths: string[]
): string {
  if (!gap) return "現行の証拠パスを維持し、次回ランで再確認する。";
  const paths = evidencePaths.join(" · ") || "(パス未設定)";
  const lead = improvementForGap(gap, paths);
  return others.length === 0
    ? lead
    : `${lead} あわせて: ${others.map((other) => improvementForGap(other, paths)).join(" / ")}`;
}

function summarize(findings: IsoInternalAuditFinding[]): IsoInternalAuditSummary {
  const summary: IsoInternalAuditSummary = {
    total: findings.length,
    conform: 0,
    observation: 0,
    nonconformity: 0,
    map_missing: 0,
  };
  for (const finding of findings) summary[finding.verdict] += 1;
  return summary;
}

function overallFrom(summary: IsoInternalAuditSummary): IsoAuditOverall {
  if (summary.nonconformity > 0 || summary.map_missing > 0) return "nonconform";
  return summary.observation > 0 ? "conditionally_conform" : "conform";
}

function disabledStandardFinding(standard: string): IsoInternalAuditFinding {
  return {
    priority: "P1",
    control_id: `MAP-${standard}`,
    standard,
    clause: "standards.yaml",
    title: `${standard} はテナントで無効`,
    verdict: "map_missing",
    detail: "standards.yaml で enabled: true になっていない",
    other_gaps: [],
    primary_agent: "internal_audit",
    improvement: `${standard} を有効化するか、有効な規格で監査する。`,
  };
}

function mapMissingFinding(standard: string): IsoInternalAuditFinding | undefined {
  const catalogEntry = findIsoCatalogEntry(standard);
  if (!catalogEntry) {
    return {
      priority: "P1",
      control_id: `MAP-${standard}`,
      standard,
      clause: "catalog",
      title: `${standard} が ISO カタログにない`,
      verdict: "map_missing",
      detail: "steward/standards/iso/catalog.yaml に id が無い",
      other_gaps: [],
      primary_agent: "internal_audit",
      improvement: "カタログへ規格を追加し、control-map.yaml を置く。",
    };
  }
  if (catalogEntry.status === "coming_soon") {
    return {
      priority: "P1",
      control_id: `MAP-${standard}`,
      standard,
      clause: "catalog",
      title: `${standard} は未提供（coming_soon）`,
      verdict: "map_missing",
      detail: "カタログ登録のみでパックが無い。監査対象にできない",
      other_gaps: [],
      primary_agent: "internal_audit",
      improvement: `orgos iso scaffold ${standard} でパック雛形を作り、領域統制を書く。`,
    };
  }
  const mapPath = getControlMapPath(standard);
  const mapped = existsSync(mapPath)
    ? [...loadControlMapForStandard(standard), ...loadCoreBindingsForStandard(standard)]
    : [];
  if (mapped.length > 0) return undefined;
  return {
    priority: "P1",
    control_id: `MAP-${standard}`,
    standard,
    clause: "control-map",
    title: `${standard} の機械可読マップがない`,
    verdict: "map_missing",
    detail: `${mapPath} が無い、または統制・core_bindings が 0 件`,
    other_gaps: [],
    primary_agent: "internal_audit",
    improvement: "core_bindings と領域統制を持つ control-map.yaml をパックに追加する。",
  };
}

function mapMissingFindings(standards: string[]): IsoInternalAuditFinding[] {
  const catalogIds = new Set(listIsoCatalogEntries().map((entry) => entry.id));
  return standards.flatMap((standard) => {
    if (!catalogIds.has(standard)) return [mapMissingFinding(standard)!];
    const finding = mapMissingFinding(standard);
    return finding ? [finding] : [];
  });
}

function controlFindings(standards: string[], filter?: string): IsoInternalAuditFinding[] {
  const gaps = gapsByControl(computeControlGaps());
  const findings: IsoInternalAuditFinding[] = [];
  const seen = new Set<string>();
  for (const control of listEffectiveControls()) {
    if (!control.in_scope || seen.has(control.id)) continue;
    if (filter && !control.iso_refs.some((reference) => reference.standard === filter)) continue;
    if (
      standards.length > 0 &&
      !control.iso_refs.some((reference) => standards.includes(reference.standard))
    ) {
      continue;
    }
    const reference =
      (filter
        ? control.iso_refs.find((item) => item.standard === filter)
        : control.iso_refs.find((item) => standards.includes(item.standard))) ??
      control.iso_refs[0];
    if (!reference?.standard) continue;
    seen.add(control.id);
    const controlGaps = gaps.get(control.id) ?? [];
    const picked = pickVerdict(controlGaps);
    const otherGaps = controlGaps.filter((gap) => gap !== picked.gap);
    findings.push({
      priority: control.priority,
      control_id: control.id,
      standard: reference.standard,
      clause: reference.clause ?? "—",
      title: control.title,
      verdict: picked.verdict,
      gap_type: picked.gap?.gap_type,
      detail:
        picked.verdict === "conform"
          ? `証拠・成熟度は目標 ${control.target_maturity} に対し ${control.tenant_maturity}`
          : (picked.gap?.detail ?? "ギャップあり"),
      other_gaps: otherGaps.map((gap) => ({ gap_type: gap.gap_type, detail: gap.detail })),
      primary_agent: control.primary_agent,
      improvement: improvementFor(picked.gap, otherGaps, control.evidence_paths),
    });
  }
  return findings;
}

function buildRun(standards: string[], findings: IsoInternalAuditFinding[]): IsoInternalAuditRun {
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

export function evaluateIsoInternalAudit(opts: { iso?: string } = {}): IsoInternalAuditRun {
  if (opts.iso && !loadEnabledIsoIds().includes(opts.iso)) {
    return buildRun([], [disabledStandardFinding(opts.iso)]);
  }
  const standards = enabledStandards(opts.iso);
  const findings = [...mapMissingFindings(standards), ...controlFindings(standards, opts.iso)];
  return buildRun(standards, findings);
}

export function runIsoInternalAudit(
  opts: {
    iso?: string;
    persist?: boolean;
    writeReports?: boolean;
  } = {}
): { run: IsoInternalAuditRun; logPath?: string; reportPaths: string[] } {
  const run = evaluateIsoInternalAudit({ iso: opts.iso });
  if (opts.persist === false) return { run, reportPaths: [] };
  const persisted = persistIsoInternalAuditRun(run, { writeReports: opts.writeReports });
  return { run, ...persisted };
}
