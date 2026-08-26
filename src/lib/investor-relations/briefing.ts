import type { CapTableFile } from "../../../schemas/investor-relations/index.js";
import type { DisclosureCalendarFile } from "../../../schemas/investor-relations/index.js";
import type { InvestorRegistryFile } from "../../../schemas/investor-relations/index.js";
import type { IrMaterialsFile } from "../../../schemas/investor-relations/index.js";
import { reviewCapTable } from "./cap-table.js";
import { expandDisclosureCalendar } from "./disclosure-calendar.js";

export interface IrBriefingInput {
  capTable?: CapTableFile | null;
  registry?: InvestorRegistryFile | null;
  calendar?: DisclosureCalendarFile | null;
  materials?: IrMaterialsFile | null;
  today?: string;
}

export interface IrBriefingSummary {
  cap_table_lines: number;
  cap_table_ok: boolean;
  investor_contacts: number;
  materials_count: number;
  materials_in_review: number;
  upcoming_disclosures: number;
  overdue_disclosures: number;
}

export function buildIrBriefingSummary(input: IrBriefingInput): IrBriefingSummary {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const capReview = input.capTable ? reviewCapTable(input.capTable) : null;
  const upcoming = input.calendar
    ? expandDisclosureCalendar(input.calendar, { today, daysAhead: 90 })
    : [];
  const overdue = input.calendar
    ? input.calendar.items.filter(
        (item) =>
          item.status !== "published" &&
          item.status !== "not_applicable" &&
          item.due_date < today,
      )
    : [];

  const materials = input.materials?.materials ?? [];
  const inReview = materials.filter(
    (m) => m.status === "in_review" || m.status === "draft",
  ).length;

  return {
    cap_table_lines: capReview?.line_count ?? input.capTable?.lines.length ?? 0,
    cap_table_ok: capReview?.ok ?? false,
    investor_contacts: input.registry?.contacts.length ?? 0,
    materials_count: materials.length,
    materials_in_review: inReview,
    upcoming_disclosures: upcoming.length,
    overdue_disclosures: overdue.length,
  };
}

export function formatIrBriefingMarkdown(
  summary: IrBriefingSummary,
  opts: { today?: string } = {},
): string {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  return [
    `# IR briefing — ${today}`,
    "",
    "## Cap table",
    `- lines: ${summary.cap_table_lines}`,
    `- validation: ${summary.cap_table_ok ? "OK" : "issues"}`,
    "",
    "## Investors",
    `- registry contacts: ${summary.investor_contacts}`,
    "",
    "## Materials",
    `- total: ${summary.materials_count}`,
    `- draft/in_review: ${summary.materials_in_review}`,
    "",
    "## Disclosure calendar",
    `- upcoming (90d): ${summary.upcoming_disclosures}`,
    `- overdue: ${summary.overdue_disclosures}`,
    "",
  ].join("\n");
}
