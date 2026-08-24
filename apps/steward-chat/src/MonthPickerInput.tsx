import { useMemo } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Inclusive YYYY-MM bounds when `months` is omitted. */
  min?: string;
  max?: string;
  /** Explicit month list (preferred; one stable `<select>`). */
  months?: string[];
  "aria-label"?: string;
  placeholder?: string;
};

/** `2026-07` → `2026年7月` */
export function formatMonthOptionLabel(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month;
  return `${match[1]}年${Number(match[2])}月`;
}

export function enumerateMonths(min?: string, max?: string): string[] {
  if (!min || !max) return [];
  const start = parseYearMonth(min);
  const end = parseYearMonth(max);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    cursor += 1;
  }
  return out;
}

function parseYearMonth(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/**
 * Cross-browser month chooser.
 * Native `<input type="month">` / `showPicker()` is not Baseline (Firefox /
 * Safari often fall back to text and picker behavior is inconsistent), so we
 * use a single `<select>` of YYYY-MM options instead.
 */
export function MonthPickerInput({
  value,
  onChange,
  disabled,
  min,
  max,
  months,
  "aria-label": ariaLabel,
  placeholder = "月を選択",
}: Props) {
  const options = useMemo(() => {
    if (months && months.length > 0) {
      return [...new Set(months.filter(Boolean))];
    }
    return enumerateMonths(min, max);
  }, [months, min, max]);

  const safeValue = options.includes(value) ? value : "";

  return (
    <select
      className="month-picker-input"
      value={safeValue}
      disabled={disabled || options.length === 0}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((month) => (
        <option key={month} value={month}>
          {formatMonthOptionLabel(month)}
        </option>
      ))}
    </select>
  );
}
