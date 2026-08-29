import { useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { chatApi } from "./api";

export type TowerPlanCard = {
  plan_id: string;
  message: string;
  status: string;
  reply_preview?: string;
  assignment?: {
    work_kind?: string;
    assignee_employee_id?: string;
    due_date?: string;
    to_agent?: string;
    needs_ceo_pick?: boolean;
    candidate_employee_ids?: string[];
    judgment_only?: boolean;
  };
  work_order_ids?: string[];
};

type Props = {
  plan: TowerPlanCard;
  onAssigned?: (workOrderIds: string[]) => void;
};

/**
 * Confirm Dispatch Tower assignment (ADR 0057).
 */
export function TowerActionCard({ plan, onAssigned }: Props) {
  const copy = useCopy(STEWARD_COPY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(plan.status === "assigned");
  const [assignee, setAssignee] = useState(
    plan.assignment?.assignee_employee_id ?? "",
  );
  const [dueDate, setDueDate] = useState(plan.assignment?.due_date ?? "");
  const [workOrderIds, setWorkOrderIds] = useState<string[]>(
    plan.work_order_ids ?? [],
  );

  if (plan.assignment?.judgment_only) {
    return (
      <div className="command-card">
        <p className="command-card-hint">
          {copy.towerJudgmentOnly}{" "}
          <a href="/approvals/">{copy.executiveOpenApprovals}</a>
        </p>
      </div>
    );
  }

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await chatApi<{
        ok: boolean;
        work_order_ids?: string[];
        error?: string;
      }>("/chat/v1/tower/assign", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.plan_id,
          confirmed: true,
          ...(assignee ? { assignee_employee_id: assignee } : {}),
          ...(dueDate ? { due_date: dueDate } : {}),
        }),
      });
      const ids = res.work_order_ids ?? [];
      setWorkOrderIds(ids);
      setDone(true);
      onAssigned?.(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="command-card">
      <p className="command-card-label">{copy.towerCardTitle}</p>
      <p className="muted">
        {plan.assignment?.work_kind ?? "—"} · {plan.status}
      </p>
      {plan.reply_preview ? (
        <p className="command-card-hint">{plan.reply_preview}</p>
      ) : null}
      {error ? <p className="error-banner">{error}</p> : null}
      {done ? (
        <p className="command-card-hint">
          {copy.towerAssigned}{" "}
          {workOrderIds.length > 0 ? (
            <a href={`/runs/?id=${encodeURIComponent(workOrderIds[0]!)}`}>
              {workOrderIds.join(", ")}
            </a>
          ) : (
            <a href="/runs/">{copy.executiveOpenRuns}</a>
          )}
        </p>
      ) : (
        <>
          {plan.assignment?.needs_ceo_pick &&
          (plan.assignment.candidate_employee_ids?.length ?? 0) > 0 ? (
            <label className="command-card-field">
              <span>{copy.towerAssignee}</span>
              <select
                value={assignee}
                disabled={busy}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">{copy.selectPlease}</option>
                {plan.assignment.candidate_employee_ids!.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="command-card-field">
            <span>{copy.towerDueDate}</span>
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <div className="command-card-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? copy.approving : copy.towerConfirm}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
