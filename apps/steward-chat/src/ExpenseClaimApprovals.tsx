import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  approveExpenseClaimApi,
  fetchOrgBudget,
  rejectExpenseClaimApi,
  type OrgBudgetPayload,
} from "./api";
import {
  claimsAwaitingApproval,
  nextFridayIso,
  personDisplayName,
  personEnvelopeRemainingYen,
} from "./claimSettlement";

function yen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Expense claims inside the approval inbox.
 * Shows who, how much, envelope left, and the pay-back date — not gate names.
 */
export function ExpenseClaimApprovals() {
  const copy = useCopy(STEWARD_COPY);
  const [budget, setBudget] = useState<OrgBudgetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<Record<string, string>>({});
  const [coApprover, setCoApprover] = useState<Record<string, string>>({});
  const [boardEvent, setBoardEvent] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      setBudget(await fetchOrgBudget());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const claims = useMemo(() => claimsAwaitingApproval(budget), [budget]);
  const defaultDue = useMemo(() => nextFridayIso(), []);

  if (error) return <div className="error-banner">{error}</div>;
  if (claims.length === 0) return null;

  async function onApprove(claimId: string) {
    const claim = claims.find((row) => row.claim_id === claimId);
    if (!claim) return;
    if (claim.gate === "needs_ringi" && !coApprover[claimId]) {
      setError(copy.claimNeedCoApprover);
      return;
    }
    if (claim.gate === "needs_board" && !boardEvent[claimId]) {
      setError(copy.claimNeedBoardEvent);
      return;
    }
    setBusyId(claimId);
    setError(null);
    try {
      setBudget(
        await approveExpenseClaimApi({
          claim_id: claimId,
          due_on: dueOn[claimId] ?? defaultDue,
          co_approver_id: coApprover[claimId] || undefined,
          board_event_id: boardEvent[claimId] || undefined,
          expected_claim_revision: String(claim.claim_revision ?? 0),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onSendBack(claimId: string) {
    const claim = claims.find((row) => row.claim_id === claimId);
    if (!claim) return;
    setBusyId(claimId);
    setError(null);
    try {
      setBudget(
        await rejectExpenseClaimApi({
          claim_id: claimId,
          expected_claim_revision: String(claim.claim_revision ?? 0),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="approvals-claims" aria-label={copy.claimApprovalsTitle}>
      <h2 className="section-title">{copy.claimApprovalsTitle}</h2>
      <ul className="approvals-queue-list">
        {claims.map((claim) => {
          const remaining = personEnvelopeRemainingYen(
            budget,
            claim.person_id,
            claim.account_code,
          );
          return (
            <li key={claim.claim_id} className="approvals-queue-item">
              <p className="approvals-queue-message">
                {copy.claimWho}: {personDisplayName(budget, claim.person_id)} ·{" "}
                {copy.claimAmount}: {yen(claim.amount_yen)}
                {remaining != null
                  ? ` · ${copy.claimRemaining}: ${yen(remaining)}`
                  : ""}
              </p>
              <div className="approvals-ceo-fields">
                <label className="approvals-ceo-field">
                  <span>{copy.claimDueOn}</span>
                  <input
                    type="date"
                    value={dueOn[claim.claim_id] ?? defaultDue}
                    onChange={(event) =>
                      setDueOn((prev) => ({
                        ...prev,
                        [claim.claim_id]: event.target.value,
                      }))
                    }
                  />
                </label>
                {claim.gate === "needs_ringi" ? (
                  <label className="approvals-ceo-field">
                    <span>{copy.claimCoApprover}</span>
                    <select
                      value={coApprover[claim.claim_id] ?? ""}
                      onChange={(event) =>
                        setCoApprover((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{copy.claimSelectPlease}</option>
                      {(budget?.expense_claim_representatives ?? []).map(
                        (row) => (
                          <option key={row.id} value={row.display_name}>
                            {row.display_name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
                {claim.gate === "needs_board" ? (
                  <label className="approvals-ceo-field">
                    <span>{copy.claimBoardEvent}</span>
                    <select
                      value={boardEvent[claim.claim_id] ?? ""}
                      onChange={(event) =>
                        setBoardEvent((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{copy.claimSelectPlease}</option>
                      {(budget?.expense_claim_board_events ?? []).map((row) => (
                        <option key={row.event_id} value={row.event_id}>
                          {row.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="approvals-queue-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busyId === claim.claim_id}
                  onClick={() => void onApprove(claim.claim_id)}
                >
                  {busyId === claim.claim_id
                    ? copy.claimApproving
                    : copy.claimApproveWithDue}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === claim.claim_id}
                  onClick={() => void onSendBack(claim.claim_id)}
                >
                  {copy.claimSendBack}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
