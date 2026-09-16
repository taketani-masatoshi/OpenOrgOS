import { DEFAULT_UI_LOCALE, type UiLocale } from "./locale";

/** Human-readable Operator Console session label (header). */
export function formatOperatorSessionLabel(
  user: {
    operator_id: string;
    approver_id: string;
    mode: string;
  },
  _locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  const op = user.operator_id?.trim() || "—";
  const approver = user.approver_id?.trim() || "";
  return approver && approver !== op ? approver : op;
}
