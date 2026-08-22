/** Human-readable Operator Console session label (header). */
export function formatOperatorSessionLabel(user: {
  operator_id: string;
  approver_id: string;
  mode: string;
}): string {
  const modeJa =
    user.mode === "dev" ? "開発モード" : user.mode === "prod" ? "本番モード" : user.mode;

  const op = user.operator_id?.trim() || "—";
  const approver = user.approver_id?.trim() || "";

  if (!approver || approver === op) {
    return `オペレータ ${op} · ${modeJa}`;
  }
  return `オペレータ ${op} · 承認者 ${approver} · ${modeJa}`;
}
