import { etaxError } from "../../../schemas/etax/errors.js";

/** Gregorian ISO date → e-tax19 yymmdd (era/yy/mm/dd). Reiwa only; earlier eras stay SPEC_BLOCKED. */
export function gregorianToEtaxYmd(iso: string): { era: string; yy: string; mm: string; dd: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    throw etaxError({
      code: "ETAX_XML_DATE",
      blocked: "SPEC_BLOCKED",
      field: iso,
      message: "e-Tax date values must be YYYY-MM-DD",
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const reiwaStart = Date.UTC(2019, 4, 1);
  const current = Date.UTC(year, month - 1, day);
  if (current < reiwaStart) {
    throw etaxError({
      code: "ETAX_XML_ERA_UNREGISTERED",
      blocked: "SPEC_BLOCKED",
      message: "Only Reiwa dates are registered for HOA110 body encoding",
    });
  }
  return { era: "5", yy: String(year - 2018), mm: String(month), dd: String(day) };
}
