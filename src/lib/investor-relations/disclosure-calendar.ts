import type { DisclosureCalendarFile } from "../../../schemas/investor-relations/index.js";

export interface DisclosureCalendarWindowOptions {
  today?: string;
  daysAhead?: number;
}

export interface DisclosureCalendarItemView {
  id: string;
  label: string;
  category: string;
  due_date: string;
  status: string;
  days_until: number;
}

export function expandDisclosureCalendar(
  file: DisclosureCalendarFile,
  opts: DisclosureCalendarWindowOptions = {},
): DisclosureCalendarItemView[] {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const daysAhead = opts.daysAhead ?? 90;

  return file.items
    .map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      due_date: item.due_date,
      status: item.status,
      days_until: daysBetween(today, item.due_date),
    }))
    .filter((item) => item.days_until >= 0 && item.days_until <= daysAhead)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function formatDisclosureCalendarMarkdown(
  items: DisclosureCalendarItemView[],
  opts: DisclosureCalendarWindowOptions = {},
): string {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const daysAhead = opts.daysAhead ?? 90;
  const lines = [
    `# Disclosure calendar — next ${daysAhead} days`,
    "",
    `as_of: ${today}`,
    "",
  ];

  if (!items.length) {
    lines.push("(no upcoming items in window)");
    return lines.join("\n");
  }

  for (const item of items) {
    lines.push(
      `- **${item.due_date}** (${item.days_until}d) · ${item.id} · ${item.label} · ${item.category} · ${item.status}`,
    );
  }
  return lines.join("\n");
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
