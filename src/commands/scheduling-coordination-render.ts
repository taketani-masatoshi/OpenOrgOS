import type { SchedulingCase } from "../../schemas/executive/scheduling-cases.js";
import { nextActionLabel } from "../lib/scheduling-coordination/next-action.js";

/** Pure CLI list line (no I/O). */
export function formatSchedulingListLine(c: SchedulingCase): string {
  return `${c.id} · ${c.title} · ${c.status} · next=${nextActionLabel(c.next_action)} · participants=${c.participants.length}`;
}

/** Pure human-readable propose result. */
export function formatSchedulingProposeResult(updated: SchedulingCase): string {
  const lines = [
    `✓ ${updated.id} · ${updated.proposed_slots.length} slots`,
    ...updated.proposed_slots.map((s) => `  ${s.id}: ${s.label}`),
    `  next: ${nextActionLabel(updated.next_action)}`,
  ];
  return lines.join("\n");
}

/** Pure human-readable create result. */
export function formatSchedulingNewResult(caseRow: SchedulingCase): string {
  return [
    `✓ ${caseRow.id} · ${caseRow.title}`,
    `  next: ${nextActionLabel(caseRow.next_action)}`,
    `  run: orgos executive scheduling propose --id ${caseRow.id}`,
  ].join("\n");
}

/** Pure respond result line. */
export function formatSchedulingRespondResult(updated: SchedulingCase): string {
  return `✓ ${updated.id} · next=${nextActionLabel(updated.next_action)}`;
}

/** Empty list message. */
export function formatSchedulingEmptyList(): string {
  return "(no scheduling cases)";
}
