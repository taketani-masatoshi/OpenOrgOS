import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";

export type SchedulingMealDraftKind = "clarify" | "proposal" | "reminder" | "confirm";

export function extractSchedulingCostLine(
  caseRow: Pick<SchedulingCase, "cost_estimate" | "notes">
): string | undefined {
  if (caseRow.cost_estimate?.trim()) return caseRow.cost_estimate.trim();
  const notes = caseRow.notes ?? "";
  return notes.match(/費用[:：]\s*(.+)/)?.[1]?.trim();
}

/** 会食らしさ（費用 WARN 用）— title/purpose/notes のヒューリスティック */
export function schedulingCaseLooksLikeMeal(
  caseRow: Pick<SchedulingCase, "title" | "purpose" | "notes" | "meeting_format">
): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  const text = `${caseRow.title} ${caseRow.purpose ?? ""} ${caseRow.notes ?? ""}`;
  return /会食|ランチ|昼食|dinner|lunch|食事|懇親|祝い|祝宴|宴会/i.test(text);
}

export function schedulingCaseHasCostLine(
  caseRow: Pick<SchedulingCase, "cost_estimate" | "notes">
): boolean {
  return Boolean(extractSchedulingCostLine(caseRow));
}

export class SchedulingMealCostRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingMealCostRequiredError";
  }
}

/** 会食の proposal/confirm 起案前に cost_estimate（または notes 費用行）を必須化 */
export function assertMealCostForOutboundDraft(
  caseRow: Pick<
    SchedulingCase,
    "id" | "title" | "purpose" | "notes" | "meeting_format" | "cost_estimate"
  >,
  kind: SchedulingMealDraftKind
): void {
  if (kind !== "proposal" && kind !== "confirm") return;
  if (!schedulingCaseLooksLikeMeal(caseRow)) return;
  if (schedulingCaseHasCostLine(caseRow)) return;
  throw new SchedulingMealCostRequiredError(
    `${caseRow.id}: 会食・祝いの ${kind} 起案には cost_estimate（または notes の「費用: …」）が必須です。` +
      `例: npm run orgos -- executive scheduling set-cost --id ${caseRow.id} --estimate "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします"`
  );
}
