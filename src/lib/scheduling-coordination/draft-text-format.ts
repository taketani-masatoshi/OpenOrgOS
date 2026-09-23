/** 社外確定・提案用の日本語日時ラベル（曜日付き） */
export function formatJapaneseSlotLabel(start: string, end?: string): string {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return start;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = m[4];
  const mm = m[5];
  const week = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, mo - 1, d).getDay()] ?? "";
  const datePart = `${mo}月${d}日（${week}）`;
  if (!hh || !mm) return datePart;
  let endPart = "";
  if (end) {
    const em = end.match(/(?:[T ](\d{2}):(\d{2}))/);
    if (em) endPart = `–${em[1]}:${em[2]}`;
  }
  return `${datePart} ${hh}:${mm}${endPart}`;
}
