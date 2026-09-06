import type { ExecutiveStaticReportSlot } from "./api";
import type { StaticDigestSlots } from "./StaticDigestHeader";

export function emptyDigestSlot(
  title: string,
  generate_hint: string,
): ExecutiveStaticReportSlot {
  return {
    path: null,
    title,
    as_of: null,
    markdown: null,
    generate_hint,
  };
}

export function emptyDigestSlots(
  title: string,
  weeklyHint: string,
  monthlyHint: string,
): StaticDigestSlots {
  return {
    weekly: emptyDigestSlot(title, weeklyHint),
    monthly: emptyDigestSlot(title, monthlyHint),
  };
}
