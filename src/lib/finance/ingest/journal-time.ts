/**
 * Calendar date → journal occurred_at (business-day convention).
 * Uses Asia/Tokyo calendar date at 12:00 JST (= T03:00:00.000Z).
 */
export function dateToJournalOccurredAt(calendarDate: string): string {
  const d = calendarDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`invalid calendar date for journal: ${calendarDate}`);
  }
  return `${d}T03:00:00.000Z`;
}
