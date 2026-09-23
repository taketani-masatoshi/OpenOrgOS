import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import {
  loadSchedulingJudgmentContext,
  type SchedulingJudgmentContext,
} from "./judgment-context.js";
import { SchedulingCaseNotFoundError } from "./errors.js";
import {
  applySchedulingTransition,
  type SchedulingTransition,
} from "./transitions.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

export type MutateSchedulingCaseOptions = {
  now?: Date;
  /** Override loaded judgment context (tests). */
  ctx?: SchedulingJudgmentContext;
};

/**
 * Find → fail → revision-checked save of a pure transition + next-action.
 * Side effects (drafts, lifecycle, calendar) stay in callers.
 */
export function mutateSchedulingCase(
  id: string,
  transition: SchedulingTransition,
  opts: MutateSchedulingCaseOptions = {}
): SchedulingCase {
  const current = findSchedulingCase(id);
  if (!current) {
    throw new SchedulingCaseNotFoundError(id);
  }
  const now = opts.now ?? new Date();
  const ctx = opts.ctx ?? loadSchedulingJudgmentContext(current);
  return updateSchedulingCase(current.id, current.revision, (row) =>
    applySchedulingTransition(row, transition, now, ctx)
  );
}
