import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import { OPS_PAGES_COPY } from "./ops-pages-copy";
import {
  approveReceiptClaimApi,
  fetchMe,
  fetchPendingReceiptClaims,
  listReceiptsApi,
  rejectReceiptClaimApi,
  type AuthUser,
  type StoredReceiptRow,
} from "./api";

type TabId = "pending" | "claimed" | "rejected" | "all";

function yen(n: number | undefined): string {
  if (n == null) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

function formatWhen(iso: string | undefined, locale: "ja" | "en"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(dateTimeLocale(locale));
  } catch {
    return iso;
  }
}

/**
 * Issuer-side Wire claim approval (ADR 0032).
 * Amount / lines stay issuer-local — never sent on Wire.
 */
export function ReceiptClaimPage() {
  const copy = useCopy(OPS_PAGES_COPY);
  const locale = useUiLocale();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<StoredReceiptRow[]>([]);
  const [tab, setTab] = useState<TabId>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<StoredReceiptRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [canApprove, setCanApprove] = useState(true);

  const refresh = useCallback(async () => {
    if (tab === "pending") {
      const data = await fetchPendingReceiptClaims();
      setRows(data.pending ?? []);
      return;
    }
    const status =
      tab === "claimed"
        ? "claimed"
        : tab === "rejected"
          ? "claim_rejected"
          : undefined;
    const data = await listReceiptsApi(status);
    setRows(data.receipts ?? []);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        setCanApprove(true);
        await refresh();
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          if (/403|forbidden|permission/i.test(msg)) setCanApprove(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch(() => {
        /* keep last good list */
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function approve(row: StoredReceiptRow) {
    if (busyId) return;
    if (
      !window.confirm(
        copy.confirmApprove(row.receipt_id, row.claimed_by_org_id ?? "—"),
      )
    ) {
      return;
    }
    setBusyId(row.receipt_id);
    setError("");
    setMessage("");
    try {
      await approveReceiptClaimApi({ receipt_id: row.receipt_id });
      setMessage(copy.claimedSent(row.receipt_id));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget || busyId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError(copy.needRejectReason);
      return;
    }
    setBusyId(rejectTarget.receipt_id);
    setError("");
    setMessage("");
    try {
      await rejectReceiptClaimApi({
        receipt_id: rejectTarget.receipt_id,
        reason,
      });
      setMessage(copy.rejectedMsg(rejectTarget.receipt_id));
      setRejectTarget(null);
      setRejectReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    pending: rows.filter((r) => r.claim_status === "claim_pending_approval")
      .length,
  };

  return (
    <div className="receipt-claim">
      <header className="receipt-claim-header">
        <div>
          <h1 className="receipt-claim-title ops-page-title">{copy.receiptTitle}</h1>
          <p className="receipt-claim-lead ops-page-lead">
            {copy.receiptLead}
          </p>
        </div>
        <button
          type="button"
          className="quiet-button"
          disabled={loading || Boolean(busyId)}
          onClick={() => {
            setError("");
            setMessage("");
            setLoading(true);
            void refresh()
              .catch((err) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setLoading(false));
          }}
        >
          {copy.reload}
        </button>
      </header>

      {user && (
        <p className="receipt-claim-meta">
          {copy.approver} <strong>{user.operator_id}</strong>
          <span className="receipt-claim-badge">{copy.noAmount}</span>
          {!canApprove && (
            <span className="receipt-claim-badge receipt-claim-badge-warn">
              {copy.noApprovePerm}
            </span>
          )}
        </p>
      )}

      <nav className="receipt-claim-tabs" aria-label={copy.claimStatus}>
        {(
          [
            { id: "pending", label: copy.pending },
            { id: "claimed", label: copy.claimed },
            { id: "rejected", label: copy.rejected },
            { id: "all", label: copy.all },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              tab === item.id
                ? "receipt-claim-tab is-active"
                : "receipt-claim-tab"
            }
            onClick={() => {
              setTab(item.id);
              setLoading(true);
            }}
          >
            {item.label}
            {item.id === "pending" && tab === "pending" && counts.pending > 0
              ? ` (${counts.pending})`
              : ""}
          </button>
        ))}
      </nav>

      {loading && <p className="receipt-claim-status">{copy.loading}</p>}

      {!loading && rows.length === 0 && (
        <p className="receipt-claim-empty">{copy.noClaims}</p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="receipt-claim-list">
          {rows.map((row) => {
            const open = expandedId === row.receipt_id;
            const pending = row.claim_status === "claim_pending_approval";
            return (
              <li key={row.receipt_id} className="receipt-claim-item">
                <div className="receipt-claim-item-main">
                  <button
                    type="button"
                    className="receipt-claim-expand"
                    onClick={() =>
                      setExpandedId(open ? null : row.receipt_id)
                    }
                  >
                    <strong className="receipt-claim-id">{row.receipt_id}</strong>
                    <span className="receipt-claim-detail">
                      {row.claim_status} · digest {row.digest.slice(0, 12)}… · by{" "}
                      {row.claimed_by_org_id ?? "—"}
                    </span>
                    <span className="receipt-claim-detail">
                      {copy.requestedAt(formatWhen(row.claim_requested_at, locale))}
                      {row.claim_approval_id
                        ? ` · ${row.claim_approval_id}`
                        : ""}
                    </span>
                    {row.total_amount != null && (
                      <span className="receipt-claim-local">
                        {copy.issuerLocalTotal(yen(row.total_amount))}
                      </span>
                    )}
                    {row.claim_reject_reason && (
                      <span className="receipt-claim-detail">
                        {copy.rejectReasonPrefix}{row.claim_reject_reason}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="receipt-claim-detail-panel">
                      <p className="muted">
                        {copy.localLinesHint}
                      </p>
                      <ul>
                        {(row.lines ?? []).map((line, i) => (
                          <li key={i}>
                            {line.description} · {yen(line.amount_including_tax)}{" "}
                            （{line.tax_rate}%）
                          </li>
                        ))}
                      </ul>
                      {(row.tax_totals ?? []).map((t, i) => (
                        <p key={i} className="muted">
                          {copy.taxTotal(t.tax_rate, yen(t.amount_including_tax))}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {pending && (
                  <div className="receipt-claim-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void approve(row)}
                      disabled={!canApprove || busyId === row.receipt_id}
                      title={
                        canApprove
                          ? undefined
                          : copy.needApprovePerm
                      }
                    >
                      {busyId === row.receipt_id ? copy.approving : copy.approveClaimed}
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => {
                        setRejectTarget(row);
                        setRejectReason("");
                      }}
                      disabled={!canApprove || Boolean(busyId)}
                    >
                      {copy.reject}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rejectTarget && (
        <div className="receipt-claim-modal" role="dialog" aria-modal="true">
          <div className="receipt-claim-modal-card">
            <h2>{copy.rejectClaim}</h2>
            <p>
              {rejectTarget.receipt_id} · by{" "}
              {rejectTarget.claimed_by_org_id ?? "—"}
            </p>
            <label>
              {copy.rejectReason}
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder={copy.rejectPlaceholder}
              />
            </label>
            <div className="receipt-issue-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRejectTarget(null)}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(busyId)}
                onClick={() => void submitReject()}
              >
                {copy.doReject}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className="receipt-claim-ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      <p className="receipt-claim-foot">{copy.foot}</p>
    </div>
  );
}
