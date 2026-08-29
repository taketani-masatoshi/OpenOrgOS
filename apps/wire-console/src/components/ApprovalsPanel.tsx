import { useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { approveWithSettlementCeremony } from "@ops-shared/settlement-stepup-client";
import { useSettlementStepUp } from "@ops-shared/use-settlement-stepup";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import { api, formatWireApprovalStatus, shortId, type WireApproval } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  tenantId: string;
  approvals: WireApproval[];
  onDone: () => void;
}

export function ApprovalsPanel({ tenantId, approvals, onDone }: Props) {
  const copy = useCopy(WIRE_COPY);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { runCeremony, modal } = useSettlementStepUp(api);

  const pending = approvals.filter((a) => a.status === "pending_approval");

  async function approve(noticeId: string) {
    setBusyId(noticeId);
    setError(null);
    try {
      await approveWithSettlementCeremony({
        api,
        approvalId: noticeId,
        tryApprove: () =>
          api(`/console/v1/tenants/${tenantId}/notices/${noticeId}/approve`, {
            method: "POST",
            body: JSON.stringify({}),
          }),
        runCeremony,
      });
      onDone();
    } catch (err) {
      setError(webauthnUserMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(noticeId: string) {
    setBusyId(noticeId);
    setError(null);
    try {
      await api(`/console/v1/tenants/${tenantId}/notices/${noticeId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "rejected via Wire Console" }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {modal}
      <section className="panel">
        <h3>
          {copy.approvals} <span className="count">{approvals.length}</span>
          {pending.length ? <span className="badge warn">{copy.waitingBadge(pending.length)}</span> : null}
        </h3>
        {error ? <p className="error">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{copy.colNumber}</th>
                <th>{copy.colStatus}</th>
                <th>{copy.colPeer}</th>
                <th>{copy.colContract}</th>
                <th>{copy.colNotice}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...approvals].reverse().slice(0, 20).map((a) => (
                <tr key={a.approval_id}>
                  <td>{a.approval_id}</td>
                  <td>{formatWireApprovalStatus(a.status, a.scope)}</td>
                  <td>{a.wire?.peer_id ?? "—"}</td>
                  <td>{a.wire?.contract_id ?? a.subject_ref ?? "—"}</td>
                  <td
                    className="mono"
                    data-wire-event-id={a.wire?.wire_event_id ?? ""}
                    title={a.wire?.wire_event_id}
                  >
                    {a.wire?.wire_event_id ? shortId(a.wire.wire_event_id) : "—"}
                  </td>
                  <td className="actions">
                    {a.status === "pending_approval" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === a.approval_id}
                          onClick={() => void approve(a.approval_id)}
                        >
                          {busyId === a.approval_id ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === a.approval_id}
                          onClick={() => void reject(a.approval_id)}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
