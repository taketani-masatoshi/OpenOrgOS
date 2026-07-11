import type {
  ArApEntry,
  CollectionTermsFile,
} from "../../../../../../schemas/jp-bank-corporate.js";

export type CollectionTermRule = CollectionTermsFile["rules"][number];

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${iso}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds calendar days in UTC, independent of host timezone and daylight saving. */
export function addCalendarDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Resolves a due date deterministically using calendar days.
 *
 * `days_after_month_end: N` means N calendar days after the final calendar day
 * of the booking month (0 = that month-end). It takes precedence when present.
 * Otherwise `days_after_booking` is counted from `bookedDate`.
 */
export function dueDateFromCollectionTerm(
  bookedDate: string,
  term: Pick<CollectionTermRule, "days_after_booking" | "days_after_month_end">
): string {
  if (term.days_after_month_end != null) {
    const { year, month } = parseIsoDate(bookedDate);
    const monthEnd = formatUtcDate(new Date(Date.UTC(year, month, 0)));
    return addCalendarDays(monthEnd, term.days_after_month_end);
  }
  return addCalendarDays(bookedDate, term.days_after_booking ?? 0);
}

export function validateCollectionTermReferences(
  entries: ArApEntry[],
  terms: CollectionTermsFile["rules"]
): string[] {
  const errors: string[] = [];
  const termsById = new Map(terms.map((term) => [term.id, term]));
  for (const entry of entries) {
    if (!entry.collection_term_id) continue;
    const term = termsById.get(entry.collection_term_id);
    if (!term) {
      errors.push(`${entry.id}: collection_term_id ${entry.collection_term_id} not found`);
    } else if (term.kind !== entry.kind) {
      errors.push(`${entry.id}: collection term kind ${term.kind} does not match ${entry.kind}`);
    }
  }
  return errors;
}
