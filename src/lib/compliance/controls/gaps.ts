import type { ControlGapRow, EffectiveControl } from "../../../../schemas/control-framework.js";
import { invalidRecordPaths } from "../../iso-records.js";
import { listEffectiveRegulations } from "../../regulations.js";
import { getClock } from "../../runtime-context.js";
import { loadApplicableIsoIds } from "../standards/tenant.js";
import { describeMissingEvidence, hasEvidenceForControl } from "./evidence.js";
import { isMaturityBelow, listEffectiveControls, maturityRank } from "./effective.js";

const DAY_MS = 1000 * 60 * 60 * 24;
const STALE_AFTER_DAYS = 365;

function gap(
  control: EffectiveControl,
  gap_type: ControlGapRow["gap_type"],
  detail: string
): ControlGapRow {
  return {
    control_id: control.id,
    title: control.title,
    gap_type,
    detail,
    primary_agent: control.primary_agent,
  };
}

function regulationGap(
  control: EffectiveControl,
  effectiveRegIds: Set<string>
): ControlGapRow | undefined {
  if (!control.reg_refs.length) return undefined;
  const missing = control.reg_refs.filter((ref) => !effectiveRegIds.has(ref.reg_id));
  if (missing.length !== control.reg_refs.length) return undefined;
  return gap(
    control,
    "reg_not_effective",
    `必要規程未有効: ${missing.map((ref) => ref.reg_id).join(", ")}`
  );
}

function maturityGap(control: EffectiveControl): ControlGapRow | undefined {
  if (!isMaturityBelow(control.tenant_maturity, control.target_maturity)) {
    return undefined;
  }
  return gap(
    control,
    "maturity_below_target",
    `現在 ${control.tenant_maturity} · 目標 ${control.target_maturity}`
  );
}

function documentGap(control: EffectiveControl): ControlGapRow | undefined {
  if (
    maturityRank(control.tenant_maturity) < maturityRank("L2") ||
    hasEvidenceForControl(control)
  ) {
    return undefined;
  }
  return gap(
    control,
    "doc_missing",
    `証拠パス未充足: ${describeMissingEvidence(control).join(", ") || "(none)"}`
  );
}

function invalidRecordGap(
  control: EffectiveControl,
  invalidRecords: Map<string, unknown[]>
): ControlGapRow | undefined {
  const faulty = control.evidence_paths.filter((path) => invalidRecords.has(path));
  if (!faulty.length) return undefined;
  const detail = faulty
    .map((path) => `${path}: ${invalidRecords.get(path)?.length ?? 0} 件の不備`)
    .join(", ");
  return gap(control, "record_invalid", `記録の内容が仕様を満たしません — ${detail}`);
}

function staleEvidenceGap(control: EffectiveControl, nowMs: number): ControlGapRow | undefined {
  if (!control.last_reviewed) return undefined;
  const ageDays = (nowMs - new Date(control.last_reviewed).getTime()) / DAY_MS;
  if (ageDays <= STALE_AFTER_DAYS || maturityRank(control.tenant_maturity) < maturityRank("L2")) {
    return undefined;
  }
  return gap(control, "evidence_stale", `最終レビュー ${control.last_reviewed}（365日超）`);
}

export function computeControlGaps(): ControlGapRow[] {
  const invalidRecords = invalidRecordPaths(loadApplicableIsoIds());
  const effectiveRegIds = new Set(
    listEffectiveRegulations()
      .filter((regulation) => regulation.effective)
      .map((regulation) => regulation.id)
  );
  const nowMs = getClock().nowMs();
  const gaps: ControlGapRow[] = [];

  for (const control of listEffectiveControls()) {
    if (!control.in_scope) continue;
    const regulation = regulationGap(control, effectiveRegIds);
    if (regulation) {
      gaps.push(regulation);
      continue;
    }
    for (const candidate of [
      maturityGap(control),
      documentGap(control),
      invalidRecordGap(control, invalidRecords),
      staleEvidenceGap(control, nowMs),
    ]) {
      if (candidate) gaps.push(candidate);
    }
  }
  return gaps;
}
