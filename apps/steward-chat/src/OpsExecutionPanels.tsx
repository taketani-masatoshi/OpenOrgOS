import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { chatApi } from "./api";

type PendingDraft = {
  draft_id: string;
  status: string;
  channel: string;
  subject: string;
  approval_id?: string;
  href: string;
  preview: string;
};

type BankAccount = {
  id: string;
  bank: string;
  branch?: string;
  holder?: string;
  account_number_display: string;
};

/**
 * Pending SMTP/Slack correspondence + broker transfer (L1) on Approvals page.
 */
export function OpsExecutionPanels() {
  const copy = useCopy(STEWARD_COPY);
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [transferOut, setTransferOut] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [mail, banks] = await Promise.all([
        chatApi<{ ok: boolean; drafts: PendingDraft[] }>(
          "/chat/v1/correspondence/pending",
        ),
        chatApi<{ ok: boolean; accounts: BankAccount[] }>(
          "/chat/v1/broker/accounts",
        ),
      ]);
      setDrafts(mail.drafts ?? []);
      setAccounts(banks.accounts ?? []);
      if (!from && banks.accounts?.[0]) setFrom(banks.accounts[0].id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [from]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onSend(draftId: string, dryRun: boolean) {
    setBusy(draftId);
    setError(null);
    try {
      await chatApi(`/chat/v1/correspondence/${encodeURIComponent(draftId)}/send`, {
        method: "POST",
        body: JSON.stringify({ dry_run: dryRun }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onTransfer(write: boolean) {
    setBusy("transfer");
    setError(null);
    setTransferOut(null);
    try {
      const yen = Number(amount);
      if (!Number.isFinite(yen) || yen <= 0) throw new Error("金額が不正です");
      const res = await chatApi<{
        ok: boolean;
        markdown: string;
        path?: string;
      }>("/chat/v1/broker/transfer", {
        method: "POST",
        body: JSON.stringify({
          from,
          amount: yen,
          payee,
          reference,
          dry_run: !write,
          write,
        }),
      });
      setTransferOut(
        res.path ? `${res.markdown}\n\npath: ${res.path}` : res.markdown,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ops-execution-panels">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="outlook-panel" aria-labelledby="mail-pending">
        <h2 id="mail-pending" className="section-title">
          {copy.correspondencePendingTitle}
        </h2>
        {drafts.length === 0 ? (
          <p className="page-desc muted">{copy.correspondencePendingEmpty}</p>
        ) : (
          <ul className="approvals-queue-list">
            {drafts.map((d) => (
              <li key={d.draft_id} className="approvals-queue-item">
                <p className="approvals-queue-kind">
                  {d.channel} · {d.status}
                </p>
                <p className="approvals-queue-message">{d.subject}</p>
                <details className="approvals-preview-toggle">
                  <summary>{copy.previewToggle}</summary>
                  <pre className="approvals-sched-preview">{d.preview}</pre>
                </details>
                <div className="approvals-queue-actions">
                  {d.approval_id ? (
                    <a className="btn btn-ghost btn-sm" href={d.href}>
                      {d.approval_id}
                    </a>
                  ) : null}
                  {d.status === "approved" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy === d.draft_id}
                        onClick={() => void onSend(d.draft_id, true)}
                      >
                        {copy.correspondenceDryRun}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy === d.draft_id}
                        onClick={() => void onSend(d.draft_id, false)}
                      >
                        {copy.correspondenceSend}
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="outlook-panel" aria-labelledby="broker-transfer">
        <h2 id="broker-transfer" className="section-title">
          {copy.brokerTransferTitle}
        </h2>
        <p className="page-desc muted">{copy.brokerTransferLead}</p>
        <div className="approvals-ceo-fields">
          <label className="approvals-ceo-field">
            <span>{copy.brokerFrom}</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} · {a.bank} · {a.account_number_display}
                </option>
              ))}
            </select>
          </label>
          <label className="approvals-ceo-field">
            <span>{copy.brokerAmount}</span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="approvals-ceo-field">
            <span>{copy.brokerPayee}</span>
            <input value={payee} onChange={(e) => setPayee(e.target.value)} />
          </label>
          <label className="approvals-ceo-field">
            <span>{copy.brokerReference}</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>
        <div className="approvals-queue-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy === "transfer"}
            onClick={() => void onTransfer(false)}
          >
            {copy.brokerDryRun}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy === "transfer"}
            onClick={() => void onTransfer(true)}
          >
            {copy.brokerWrite}
          </button>
        </div>
        {transferOut ? (
          <pre className="approvals-sched-preview">{transferOut}</pre>
        ) : null}
      </section>
    </div>
  );
}
