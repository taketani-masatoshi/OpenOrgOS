import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import {
  loadSchedulingJudgmentContext,
  type SchedulingJudgmentContext,
} from "./judgment-context.js";
import {
  applySchedulingTransition,
  type SchedulingTransition,
} from "./transitions.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

export type MutateSchedulingCaseOptions = {
  now?: Date;
  /** Default matches historical case-mutations wording. */
  notFoundMessage?: "case" | "scheduling";
  /** Override loaded judgment context (tests). */
  ctx?: SchedulingJudgmentContext;
};

function notFoundError(id: string, kind: "case" | "scheduling"): Error {
  return new Error(
    kind === "scheduling" ? `Scheduling case ${id} not found` : `Case ${id} not found`
  );
}

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
    throw notFoundError(id, opts.notFoundMessage ?? "case");
  }
  const now = opts.now ?? new Date();
  const ctx = opts.ctx ?? loadSchedulingJudgmentContext(current);
  return updateSchedulingCase(current.id, current.revision, (row) =>
    applySchedulingTransition(row, transition, now, ctx)
  );
}
