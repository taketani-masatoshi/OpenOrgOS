import type {
  CorrespondenceDraft,
} from "../../../schemas/correspondence/draft.js";
import type {
  SchedulingCase,
  SchedulingLiveProof,
} from "../../../schemas/executive/scheduling-cases.js";
import { hashCorrespondenceBody } from "./clarify-text.js";
import { findSchedulingCase, listSchedulingCases, updateSchedulingCase } from "./store.js";

/**
 * Secretary Agent 文案品格 KPI のみ。
 * Venue Booking（予約完了率・VR 状態等）は `venue-reservations.yaml` / Operations KPI と分離。
 */
export function recordSecretaryDraftEditIfBodyChanged(
  caseId: string,
  draft: CorrespondenceDraft
): SchedulingCase | undefined {
  const current = findSchedulingCase(caseId);
  if (!current) return undefined;
  const record = current.correspondence.find((r) => r.draft_id === draft.draft_id);
  if (!record?.body_hash_at_draft) return current;
  const nextHash = hashCorrespondenceBody(draft.body);
  if (nextHash === record.body_hash_at_draft) return current;
  return recordSecretaryDraftEdit(caseId, `draft ${draft.draft_id} edited before approval`);
}

export function recordSecretaryDraftEdit(caseId: string, note?: string): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const prev = current.quality_signals ?? { ceo_draft_edits: 0, ceo_tone_corrections: 0, style_lint_pass_count: 0, notes: [] };
  return updateSchedulingCase(caseId, current.revision, (row) => ({
    ...row,
    quality_signals: {
      ...prev,
      ceo_draft_edits: prev.ceo_draft_edits + 1,
      notes: note ? [...prev.notes, note] : prev.notes,
    },
    updated_at: new Date().toISOString(),
  }));
}

export function recordSecretaryToneCorrection(caseId: string, note: string): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const prev = current.quality_signals ?? { ceo_draft_edits: 0, ceo_tone_corrections: 0, style_lint_pass_count: 0, notes: [] };
  return updateSchedulingCase(caseId, current.revision, (row) => ({
    ...row,
    quality_signals: {
      ...prev,
      ceo_tone_corrections: prev.ceo_tone_corrections + 1,
      notes: [...prev.notes, note],
    },
    updated_at: new Date().toISOString(),
  }));
}

/** 観測メモのみ（KPI カウントを増やさない） */
export function recordSecretaryQualityObservation(caseId: string, note: string): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const prev = current.quality_signals ?? { ceo_draft_edits: 0, ceo_tone_corrections: 0, style_lint_pass_count: 0, notes: [] };
  return updateSchedulingCase(caseId, current.revision, (row) => ({
    ...row,
    quality_signals: {
      ...prev,
      notes: [...prev.notes, `[obs] ${note}`],
    },
    updated_at: new Date().toISOString(),
  }));
}

/** ライブ証明メタ — 自己往復 / inject を本番扱いにしないための正本 */
export function recordSecretaryLiveProof(
  caseId: string,
  proof: SchedulingLiveProof
): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const prev = current.quality_signals ?? { ceo_draft_edits: 0, ceo_tone_corrections: 0, style_lint_pass_count: 0, notes: [] };
  const at = proof.recorded_at ?? new Date().toISOString();
  const live_proof: SchedulingLiveProof = { ...proof, recorded_at: at };
  const summary = `[live_proof] partner=${live_proof.partner} accept=${live_proof.accept_path} venue_ref=${live_proof.venue_ref_kind}`;
  return updateSchedulingCase(caseId, current.revision, (row) => ({
    ...row,
    quality_signals: {
      ...prev,
      live_proof,
      notes: [...prev.notes, summary],
    },
    updated_at: at,
  }));
}

/** 社外メール送信時に style-lint 通過を KPI へ記録（error 0 前提） */
export function recordSecretaryStyleLintPass(
  caseId: string,
  opts: { draftId: string; warningCount: number; at?: string }
): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const prev = current.quality_signals ?? {
    ceo_draft_edits: 0,
    ceo_tone_corrections: 0,
    style_lint_pass_count: 0,
    notes: [],
  };
  const at = opts.at ?? new Date().toISOString();
  return updateSchedulingCase(caseId, current.revision, (row) => ({
    ...row,
    quality_signals: {
      ...prev,
      style_lint_pass_count: (prev.style_lint_pass_count ?? 0) + 1,
      last_style_lint_warnings: opts.warningCount,
      last_style_lint_at: at,
      notes: [
        ...prev.notes,
        `[lint] ${opts.draftId} PASS · warnings=${opts.warningCount}`,
      ],
    },
    updated_at: at,
  }));
}

export function secretaryQualityScore(caseRow: SchedulingCase): number {
  const q = caseRow.quality_signals;
  if (!q) return 0;
  return q.ceo_draft_edits + q.ceo_tone_corrections;
}

/** closed · lint PASS×3 · warnings=0 · 指摘 ≤1 */
export function isLintCleanClosedCase(row: SchedulingCase): boolean {
  if (row.status !== "closed") return false;
  const q = row.quality_signals;
  if (!q) return false;
  const edits = (q.ceo_draft_edits ?? 0) + (q.ceo_tone_corrections ?? 0);
  const passes = q.style_lint_pass_count ?? 0;
  const warns = q.last_style_lint_warnings ?? 0;
  return passes >= 3 && warns === 0 && edits <= 1;
}

/**
 * 更新日時の新しい closed 案件から連続で lint-clean な件数。
 * SCH-021 のような過去 FAIL 案件でストリークが切れるのは意図どおり。
 */
export function countConsecutiveLintCleanClosedCases(): {
  count: number;
  caseIds: string[];
} {
  const closed = listSchedulingCases({ activeOnly: false })
    .filter((row) => row.status === "closed")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const caseIds: string[] = [];
  for (const row of closed) {
    if (!isLintCleanClosedCase(row)) break;
    caseIds.push(row.id);
  }
  return { count: caseIds.length, caseIds };
}

export function buildSecretaryQualityTodaySummary(): {
  headline: string;
  detail: string;
  visible_to_ceo: boolean;
} | undefined {
  const recent = listSchedulingCases({ activeOnly: false })
    .filter((row) => row.status === "closed" || row.status === "notifying" || row.status === "confirmed")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);
  if (!recent.length) return undefined;
  const total = recent.reduce((sum, row) => sum + secretaryQualityScore(row), 0);
  const lintPasses = recent.reduce(
    (sum, row) => sum + (row.quality_signals?.style_lint_pass_count ?? 0),
    0
  );
  const streak = countConsecutiveLintCleanClosedCases();
  const streakLabel =
    streak.count > 0
      ? `連続 lint-clean ${streak.count} 件（目標3 · ${streak.caseIds.slice(0, 3).join(",") || "—"}）`
      : "連続 lint-clean 0 件（目標3）";
  return {
    headline: "秘書文案品格（直近3案件）",
    detail: `指摘合計 ${total} 件 · style-lint 通過 ${lintPasses} 通 · ${streakLabel} · ${recent.map((r) => `${r.id}=${secretaryQualityScore(r)}`).join(" · ")}`,
    visible_to_ceo: true,
  };
}
