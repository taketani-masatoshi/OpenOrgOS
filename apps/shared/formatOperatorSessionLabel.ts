import { SESSION_COPY } from "./console-copy";
import { DEFAULT_UI_LOCALE, type UiLocale } from "./locale";

/** Human-readable Operator Console session label (header). */
export function formatOperatorSessionLabel(
  user: {
    operator_id: string;
    approver_id: string;
    mode: string;
  },
  locale: UiLocale = DEFAULT_UI_LOCALE,
): string {
  const copy = SESSION_COPY[locale];
  const mode =
    user.mode === "dev" ? copy.devMode : user.mode === "prod" ? copy.prodMode : user.mode;

  const op = user.operator_id?.trim() || "—";
  const approver = user.approver_id?.trim() || "";

  if (!approver || approver === op) {
    return `${copy.operator} ${op} · ${mode}`;
  }
  return `${copy.operator} ${op} · ${copy.approver} ${approver} · ${mode}`;
}
