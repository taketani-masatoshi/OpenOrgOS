import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { resolveNextAction } from "./judgment-context.js";
import { updateSchedulingCase } from "./store.js";

/**
 * Persist only when status / next_action / exception_reason change.
 * Does not create drafts, send mail, or call external APIs.
 * Kept out of next-action.ts so judgment stays pure.
 */
export function persistSchedulingNextAction(caseRow: SchedulingCase): SchedulingCase {
  const desired = resolveNextAction(caseRow);
  if (
    desired.status === caseRow.status &&
    desired.next_action === caseRow.next_action &&
    desired.exception_reason === caseRow.exception_reason
  ) {
    return caseRow;
  }
  return updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);
}
