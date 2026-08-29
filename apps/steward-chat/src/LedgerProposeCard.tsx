import { useEffect, useState } from "react";
import { fetchLedgerAccounts, postLedgerProposalEnqueue } from "./api";

export function LedgerProposeCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<
    Array<{ code: string; name: string; type: string }>
  >([]);
  const [form, setForm] = useState({
    description: "",
    debit_account: "5100",
    credit_account: "1100",
    amount_yen: "10000",
  });

  useEffect(() => {
    void fetchLedgerAccounts()
      .then((res) => {
        if (res.accounts?.length) setAccounts(res.accounts);
      })
      .catch(() => undefined);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await postLedgerProposalEnqueue({
        description: form.description || "Chat 提案仕訳",
        debit_account: form.debit_account,
        credit_account: form.credit_account,
        amount_yen: Number(form.amount_yen),
        source: "chat",
      });
      setLastId(res.proposal.id);
      setForm((f) => ({ ...f, description: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const accountOptions =
    accounts.length > 0
      ? accounts
      : [
          { code: "5100", name: "経費", type: "expense" },
          { code: "1100", name: "現金", type: "asset" },
          { code: "4000", name: "売上", type: "income" },
        ];

  return (
    <details
      className="lf-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="section-title">チャットから仕訳を提案</summary>
      <p className="muted page-desc">
        科目を選んで仕訳案をキューに積みます。投稿はワークベンチで承認してください。
      </p>
      {error && <p className="error-banner">{error}</p>}
      {lastId && (
        <p className="muted">
          提案 {lastId} をキューに追加しました。{" "}
          <a href="/?ledger=1#proposals">ワークベンチで承認</a>
        </p>
      )}
      <div className="ledger-actions">
        <label className="muted">
          摘要
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <label className="muted">
          借方
          <select
            value={form.debit_account}
            onChange={(e) => setForm((f) => ({ ...f, debit_account: e.target.value }))}
          >
            {accountOptions.map((a) => (
              <option key={`d-${a.code}`} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="muted">
          貸方
          <select
            value={form.credit_account}
            onChange={(e) => setForm((f) => ({ ...f, credit_account: e.target.value }))}
          >
            {accountOptions.map((a) => (
              <option key={`c-${a.code}`} value={a.code}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="muted">
          金額
          <input
            value={form.amount_yen}
            onChange={(e) => setForm((f) => ({ ...f, amount_yen: e.target.value }))}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          提案をキューに追加
        </button>
      </div>
    </details>
  );
}
