import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchTaxCalendar,
  fetchTaxConsumption,
  fetchTaxGaps,
  fetchTaxPayrollYea,
  fetchTaxReadiness,
  postTaxBonusDraft,
  postTaxHandoff,
  postTaxPayrollCalc,
  postTaxXmlDraft,
  postTaxYeaCompute,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";

/**
 * Tax module surface — accounting workbench links here.
 * e-Tax production submit is never offered.
 */
export function TaxHandoffPage() {
  const copy = useCopy(STEWARD_COPY);
  const [readiness, setReadiness] = useState<string | null>(null);
  const [yea, setYea] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bonusPeriod, setBonusPeriod] = useState("2026-12");
  const [bonusGross, setBonusGross] = useState("500000");
  const [lastHandoffPath, setLastHandoffPath] = useState<string | null>(null);
  const [calendarRows, setCalendarRows] = useState<
    Array<{
      id: string;
      tax: string;
      deadline: string;
      status: string;
      remaining_text: string;
      amount_display: string;
      next_action: string;
    }>
  >([]);
  const [calendarStats, setCalendarStats] = useState<string | null>(null);
  const [gapSummary, setGapSummary] = useState<string | null>(null);
  const [gapItems, setGapItems] = useState<
    Array<{ id: string; severity: string; area: string; message: string; status: string }>
  >([]);
  const [consumption, setConsumption] = useState<string | null>(null);
  const [consumptionIssues, setConsumptionIssues] = useState<
    Array<{ severity: string; message: string }>
  >([]);
  const [payMonth, setPayMonth] = useState("2026-08");
  const [payGross, setPayGross] = useState("300000");
  const [payDependents, setPayDependents] = useState("0");

  useEffect(() => {
    void fetchTaxReadiness()
      .then((r) =>
        setReadiness(
          `${r.ready_for_handoff ? "handoff 可" : "未準備"} — ${r.note}`,
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void fetchTaxPayrollYea()
      .then((r) => setYea(`${r.yea_status} — ${r.note}`))
      .catch(() => setYea(null));
    void fetchTaxCalendar()
      .then((r) => {
        setCalendarStats(
          `open ${r.stats.open} · 期限近 ${r.stats.due_soon} · 超過 ${r.stats.overdue}`,
        );
        setCalendarRows(r.rows);
      })
      .catch(() => setCalendarStats(null));
    void fetchTaxGaps()
      .then((r) => {
        setGapSummary(`open ${r.open} · deferred ${r.deferred} · resolved ${r.resolved}`);
        setGapItems(r.items);
      })
      .catch(() => setGapSummary(null));
    void fetchTaxConsumption()
      .then((r) => {
        setConsumption(
          `${r.status} · 基準期間売上 ${
            r.base_period_sales_jpy != null
              ? `${r.base_period_sales_jpy.toLocaleString("ja-JP")} 円`
              : "未設定"
          } · インボイス ${r.invoice_registered ? "登録" : "未登録"}`,
        );
        setConsumptionIssues(r.issues);
      })
      .catch(() => setConsumption(null));
  }, []);

  async function run<T>(fn: () => Promise<T>, okMsg: (result: T) => string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      setMessage(okMsg(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsPage
      title={copy.tax}
      lead="会計（帳簿）から分離した申告・給与年末の handoff です。e-Tax / eLTAX への本番提出は行いません（ADR 0052）。"
      error={error}
      className="tax-handoff-page"
    >
      <p>
        <span className="badge warn">e-Tax 提出不可</span>
      </p>
      {message && <p className="ops-page-meta">{message}</p>}

      <section className="ops-card">
        <h2 className="section-title">税カレンダー</h2>
        <p className="ops-page-meta">{calendarStats ?? copy.loading}</p>
        {calendarRows.length === 0 ? (
          <p className="muted">カレンダー行はありません</p>
        ) : (
          <ul>
            {calendarRows.map((row) => (
              <li key={row.id}>
                {row.tax} · {row.deadline} · {row.status} · {row.amount_display} ·{" "}
                {row.remaining_text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">申告ギャップ</h2>
        <p className="ops-page-meta">{gapSummary ?? copy.loading}</p>
        {gapItems.length === 0 ? (
          <p className="muted">open / deferred のギャップはありません</p>
        ) : (
          <ul>
            {gapItems.map((g) => (
              <li key={g.id}>
                [{g.severity}] {g.area}: {g.message} ({g.status})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">消費税 assessment</h2>
        <p className="ops-page-meta">{consumption ?? copy.loading}</p>
        {consumptionIssues.length > 0 ? (
          <ul>
            {consumptionIssues.map((issue) => (
              <li key={issue.message}>
                [{issue.severity}] {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="ops-card">
        <h2 className="section-title">申告 readiness</h2>
        <p className="ops-page-meta" role="status">
          {readiness ?? copy.loading}
        </p>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () => postTaxXmlDraft(),
                (r) => `XML ドラフト: ${r.relative_path} (${r.submission})`,
              )
            }
          >
            XML ドラフト生成
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () => postTaxHandoff(),
                (r) => {
                  setLastHandoffPath(r.zip_path);
                  return `Handoff ZIP: ${r.zip_path}`;
                },
              )
            }
          >
            顧問 handoff パッケージ作成
          </button>
        </div>
        {lastHandoffPath && (
          <p className="ops-page-meta">
            出力パス: <code>{lastHandoffPath}</code>（e-Tax 提出不可）
          </p>
        )}
      </section>

      <section className="ops-card">
        <h2 className="section-title">賞与・年末調整</h2>
        <p className="ops-page-meta">{yea ?? "給与モジュール未読込"}</p>
        <label className="wallet-field">
          賞与月
          <input
            value={bonusPeriod}
            onChange={(e) => setBonusPeriod(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          賞与総額（円）
          <input
            type="number"
            value={bonusGross}
            onChange={(e) => setBonusGross(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  postTaxBonusDraft({
                    period: bonusPeriod,
                    gross_yen: Number(bonusGross),
                  }),
                (r) => `賞与ドラフト ${r.run.run_id} · 手取り ${r.run.net_yen}`,
              )
            }
          >
            賞与ドラフト作成
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () => postTaxYeaCompute(),
                (r) =>
                  `YEA ${r.yea.fiscal_year} ${r.yea.status} · ${r.yea.employee_count} 名（提出なし）`,
              )
            }
          >
            年末調整ドラフト計算
          </button>
        </div>
      </section>

      <section className="ops-card">
        <h2 className="section-title">給与計算</h2>
        <p className="ops-page-meta">決定論計算のみ。e-file 提出はしません。</p>
        <label className="wallet-field">
          対象月
          <input
            value={payMonth}
            onChange={(e) => setPayMonth(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          総支給（円）
          <input
            type="number"
            value={payGross}
            onChange={(e) => setPayGross(e.target.value)}
          />
        </label>
        <label className="wallet-field">
          扶養人数
          <input
            type="number"
            value={payDependents}
            onChange={(e) => setPayDependents(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  postTaxPayrollCalc({
                    month: payMonth,
                    gross_yen: Number(payGross),
                    dependents: Number(payDependents),
                  }),
                (r) =>
                  `${r.run.month} 手取り ${r.run.net_pay_yen.toLocaleString("ja-JP")} · 源泉 ${r.run.withholding_yen.toLocaleString("ja-JP")}`,
              )
            }
          >
            給与を計算
          </button>
        </div>
      </section>

      <p className="section-cta">
        <a href="/?ledger=1">帳簿ワークベンチへ戻る</a>
        {" · "}
        <a href="/stays/">宿泊</a>
        {" · "}
        <a href="/contracts/">契約</a>
      </p>
    </OpsPage>
  );
}
