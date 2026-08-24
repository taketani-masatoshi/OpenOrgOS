import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { requireCliHumanApproval, auditCliMutation } from "../console-auth/cli-operator.js";
import { applyNextAction } from "../scheduling-coordination/next-action.js";
import { ensureSchedulingCorrespondenceDrafts } from "../scheduling-coordination/lifecycle.js";
import { findSchedulingCase, updateSchedulingCase } from "../scheduling-coordination/store.js";
import {
  formatVenueSuggestionLines,
  suggestVenuesForParties,
  type VenueSuggestTiming,
} from "./suggest.js";

/**
 * CEO-approved apply of transit-ranked catalog venues onto a scheduling case
 * (same outcome as answering schedule_venue_* with suggest lines).
 * Does not rewrite already-sent clarify first_pick semantics for email —
 * caller should only use before clarify send, or explicitly accept sticky override.
 */
export function applyVenueSuggestToSchedulingCase(opts: {
  caseId: string;
  timing?: VenueSuggestTiming;
  /** When true, allow updating venue even if a clarify was already sent */
  allowAfterClarifySent?: boolean;
  operatorId?: string;
}): SchedulingCase {
  requireCliHumanApproval("operations venue apply-suggest");
  const caseRow = findSchedulingCase(opts.caseId);
  if (!caseRow) throw new Error(`Scheduling case ${opts.caseId} not found`);

  const clarifySent = caseRow.correspondence.some((r) => r.kind === "clarify" && r.sent_at);
  if (clarifySent && !opts.allowAfterClarifySent) {
    throw new Error(
      `${opts.caseId}: clarify already sent — pass allowAfterClarifySent to override first pick (or re-clarify)`
    );
  }

  const result = suggestVenuesForParties({
    caseRow,
    timing: opts.timing,
    limit: 3,
  });
  if (result.suggestions.length < 3) {
    throw new Error(
      `Need 3 venue suggestions (got ${result.suggestions.length}) — expand venue-catalog.yaml`
    );
  }
  const lines = formatVenueSuggestionLines(result.suggestions);
  const [a, b, c] = result.suggestions;

  const venue_options = [
    {
      id: "A" as const,
      name: a!.name,
      facts: a!.facts,
      first_pick: true,
    },
    {
      id: "B" as const,
      name: b!.name,
      facts: b!.facts,
      first_pick: false,
    },
    {
      id: "C" as const,
      name: c!.name,
      facts: c!.facts,
      first_pick: false,
    },
  ];

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, (row) =>
    applyNextAction({
      ...row,
      location: lines.firstPick,
      venue_options,
      notes: [
        row.notes,
        "【venue apply-suggest】",
        `タイミング: ${result.timing}`,
        `A: ${lines.optionA}`,
        `B: ${lines.optionB}`,
        `C: ${lines.optionC}`,
      ]
        .filter(Boolean)
        .join("\n"),
      updated_at: new Date().toISOString(),
    })
  );

  if (updated.next_action === "send_clarify" || !clarifySent) {
    updated = ensureSchedulingCorrespondenceDrafts(updated.id, "clarify");
  }

  auditCliMutation("operations venue apply-suggest", updated.id);
  return updated;
}

/** Build CEO field map for schedule_venue_* from suggest (prefills answer CLI). */
export function buildCeoVenueFieldsFromSuggest(caseId: string): Record<string, string> {
  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new Error(`Scheduling case ${caseId} not found`);
  const result = suggestVenuesForParties({ caseRow, limit: 3 });
  const lines = formatVenueSuggestionLines(result.suggestions);
  if (!lines.firstPick || !lines.optionA || !lines.optionB || !lines.optionC) {
    throw new Error(`Insufficient suggestions for ${caseId}`);
  }
  return {
    schedule_venue_first: lines.firstPick,
    schedule_venue_a: lines.optionA,
    schedule_venue_b: lines.optionB,
    schedule_venue_c: lines.optionC,
  };
}
