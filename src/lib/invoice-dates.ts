import { addMonths, parseMonth } from "./utils.js";

/** ISO date (YYYY-MM-DD) for the last calendar day of a billing month. */
export function billingMonthEndDate(billingMonth: string): string {
  const { year, month } = parseMonth(billingMonth);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Payment due: last day of the month after the billing month (翌月末). */
export function paymentDueDate(billingMonth: string): string {
  return billingMonthEndDate(addMonths(billingMonth, 1));
}

export function formatJapaneseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

export function formatJapaneseYearMonth(billingMonth: string): string {
  const { year, month } = parseMonth(billingMonth);
  return `${year}年${month}月`;
}

export function invoiceNumber(billingMonth: string): string {
  return `INV-BANCHO-${billingMonth}`;
}
