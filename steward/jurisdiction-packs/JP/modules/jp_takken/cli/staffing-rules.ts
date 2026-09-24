import type { TakkenOffice, TakkenshiAssignment } from "../../../../../../schemas/jp-takken.js";
import type { TakkenCheckItem, TakkenVerdict } from "./check-item.js";
import { addDays, addMonths, daysBetween } from "./dates.js";

/** 宅地建物取引業法施行規則第15条の5の3 — 事務所の業務従事者に対する専任の宅建士の割合は 1/5 以上 */
export const STAFF_PER_DEDICATED_TAKKENSHI = 5;
/** 宅地建物取引業法第31条の3第3項 — 抵触するに至ったときは2週間以内に適合させる措置（民法第140条により初日不算入） */
export const TAKKENSHI_SHORTAGE_CURE_DAYS = 14;
/** 宅地建物取引業法第22条の2第2項・第22条の3第2項 — 更新には申請前6月以内の法定講習の受講が必要 */
export const CARD_RENEWAL_COURSE_WINDOW_MONTHS = 6;

export function requiredDedicatedTakkenshi(staffCount: number): number {
  return Math.ceil(staffCount / STAFF_PER_DEDICATED_TAKKENSHI);
}

/** 法第2条第4号 · 第22条の2第3項 — 有効な宅建士証の交付を受けた者のみが宅地建物取引士 */
export function isCardValidOn(assignment: TakkenshiAssignment, onDate: string): boolean {
  return assignment.card_expires_on >= onDate;
}

export function countQualifiedDedicated(office: TakkenOffice, asOf: string): number {
  return office.takkenshi.filter((t) => t.dedicated && isCardValidOn(t, asOf)).length;
}

export function shortageCureDeadline(shortageSince: string): string {
  return addDays(shortageSince, TAKKENSHI_SHORTAGE_CURE_DAYS);
}

function staffingVerdict(office: TakkenOffice, asOf: string): TakkenVerdict {
  const required = requiredDedicatedTakkenshi(office.staff_count);
  const qualified = countQualifiedDedicated(office, asOf);
  const ratio = `従業者 ${office.staff_count} 人 · 必要 ${required} 人 · 有効な専任 ${qualified} 人`;
  if (qualified >= required) return { status: "ok", detail: ratio };
  if (!office.takkenshi_shortage_since) {
    return { status: "fail", detail: `${ratio} — 不足（takkenshi_shortage_since 未記録 · 2週間以内に補充）` };
  }
  const deadline = shortageCureDeadline(office.takkenshi_shortage_since);
  if (asOf <= deadline) {
    return { status: "warn", detail: `${ratio} — 補充期限 ${deadline}（残 ${daysBetween(asOf, deadline)} 日）` };
  }
  return { status: "fail", detail: `${ratio} — 補充期限 ${deadline} 超過` };
}

export function evaluateOfficeStaffing(office: TakkenOffice, asOf: string): TakkenCheckItem {
  return {
    id: `staffing-${office.office_id}`,
    label: `専任の宅建士（5人に1人以上）— ${office.name}`,
    article: "法第31条の3 · 施行規則第15条の5の3",
    ...staffingVerdict(office, asOf),
  };
}

function cardVerdict(assignment: TakkenshiAssignment, asOf: string): TakkenVerdict {
  const expiresOn = assignment.card_expires_on;
  if (!isCardValidOn(assignment, asOf)) {
    return assignment.dedicated
      ? { status: "fail", detail: `有効期限 ${expiresOn} 経過 — 専任として算入不可 · 宅建士事務不可` }
      : { status: "warn", detail: `有効期限 ${expiresOn} 経過 — 重要事項説明・記名等の宅建士事務不可` };
  }
  const courseWindowOpens = addMonths(expiresOn, -CARD_RENEWAL_COURSE_WINDOW_MONTHS);
  if (asOf >= courseWindowOpens) {
    return { status: "warn", detail: `有効期限 ${expiresOn} — 法定講習（申請前6月以内）を受講し更新申請` };
  }
  return { status: "ok", detail: `有効期限 ${expiresOn}` };
}

export function evaluateCardExpiry(
  assignment: TakkenshiAssignment,
  officeId: string,
  asOf: string
): TakkenCheckItem {
  const role = assignment.dedicated ? "専任" : "非専任";
  return {
    id: `card-${officeId}-${assignment.employee_id}`,
    label: `宅建士証の有効期間（5年）— ${assignment.employee_id}（${role}）`,
    article: "法第22条の2第3項 · 第22条の3",
    ...cardVerdict(assignment, asOf),
  };
}

export function evaluateStaffingChecks(offices: readonly TakkenOffice[], asOf: string): TakkenCheckItem[] {
  return offices.flatMap((office) => [
    evaluateOfficeStaffing(office, asOf),
    ...office.takkenshi.map((assignment) => evaluateCardExpiry(assignment, office.office_id, asOf)),
  ]);
}
