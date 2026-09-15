import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchTaxCalendar,
  fetchTaxConsumption,
  fetchTaxDigest,
  fetchTaxGaps,
  fetchTaxPayrollYea,
  fetchTaxReadiness,
  fetchSolePropSetup,
  fetchSolePropExpenseIntakeClarify,
  fetchSolePropIncomeDeductions,
  fetchPresentationSanity,
  type ExecutiveStaticReportSlot,
  type PresentationSanitySnapshot,
  postTaxBonusDraft,
  postTaxHandoff,
  postTaxPayrollCalc,
  postTaxXmlDraft,
  postTaxYeaCompute,
} from "./api";
import { emptyDigestSlots } from "./digestSlots";
import { LiveSection } from "./LiveSection";
import { OpsPage } from "./OpsPage";
import { StaticDigestHeader } from "./StaticDigestHeader";
import { STEWARD_COPY } from "./steward-copy";

const EMPTY_TAX = emptyDigestSlots(
  "税務ダイジェスト",
  "orgos tax digest --period weekly --write",
  "orgos tax digest --period monthly --write",
);

/**
 * Tax module surface — accounting workbench links here.
 * e-Tax production submit is never offered.
 */
export function TaxHandoffPage() {
  const copy = useCopy(STEWARD_COPY);
  const [slots, setSlots] = useState<{
    weekly: ExecutiveStaticReportSlot;
    monthly: ExecutiveStaticReportSlot;
  }>(EMPTY_TAX);
  const [liveReady, setLiveReady] = useState(false);
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
  const [soleSetup, setSoleSetup] = useState<string | null>(null);
  const [soleQuestions, setSoleQuestions] = useState<
    Array<{ id: string; prompt: string }>
  >([]);
  const [soleOptionalQuestions, setSoleOptionalQuestions] = useState<
    Array<{ id: string; prompt: string; hint?: string }>
  >([]);
  const [expenseAmount, setExpenseAmount] = useState("11000");
  const [expenseClarify, setExpenseClarify] = useState<string | null>(null);
  const [sanityPeriod, setSanityPeriod] = useState(String(new Date().getFullYear()));
  const [sanityFindings, setSanityFindings] = useState<
    Array<{ code: string; level: string; message: string }>
  >([]);
  const [sanityMeta, setSanityMeta] = useState<string | null>(null);
  const [sanityBaselineLine, setSanityBaselineLine] = useState<string | null>(null);
  const [deductionsCard, setDeductionsCard] = useState<{
    year: number;
    missing: boolean;
    total: number;
    lines: Array<{ label: string; amount_yen: number }>;
  } | null>(null);

  useEffect(() => {
    void fetchTaxDigest()
      .then((r) => setSlots(r.static_reports ?? EMPTY_TAX))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const loadLive = useCallback(() => {
    if (liveReady) return;
    setLiveReady(true);
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
    void fetchSolePropSetup()
      .then((r) => {
        setSoleSetup(
          r.assessment.ready
            ? "setup ready"
            : `setup 未充足 · missing ${r.assessment.missing.length}`,
        );
        setSoleQuestions(
          r.assessment.clarify_questions.map((q) => ({ id: q.id, prompt: q.prompt })),
        );
        setSoleOptionalQuestions(r.assessment.optional_questions ?? []);
        const setupYear = r.assessment.setup?.calendar_year;
        const period =
          typeof setupYear === "number" && Number.isFinite(setupYear)
            ? String(setupYear)
            : sanityPeriod;
        if (period !== sanityPeriod) setSanityPeriod(period);
        void fetchSolePropIncomeDeductions(
          typeof setupYear === "number" ? setupYear : undefined,
        )
          .then((d) => {
            setDeductionsCard({
              year: d.year,
              missing: d.missing || !d.deductions,
              total: d.capped.total,
              lines: d.capped.lines,
            });
          })
          .catch((e) => {
            setDeductionsCard(null);
            setError(
              `所得控除読込失敗: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
        void fetchPresentationSanity(period)
          .then((sanity) => {
            applySanityResult(sanity);
          })
          .catch((e) => {
            setSanityBaselineLine(
              `表示健全性読込失敗: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
      })
      .catch((e) => {
        setSoleSetup(
          `setup 読込失敗: ${e instanceof Error ? e.message : String(e)}`,
        );
        setSoleOptionalQuestions([]);
      });
  }, [liveReady, sanityPeriod]);

  function applySanityResult(r: {
    period: string;
    findings: Array<{ code: string; level: string; message: string }>;
    metrics: PresentationSanitySnapshot;
    baseline: PresentationSanitySnapshot | null;
  }) {
    setSanityMeta(
      `${r.period} · assets ${r.metrics.corporate_total_assets_yen.toLocaleString("ja-JP")} · 事業主貸 ${r.metrics.owner_draw_yen ?? "—"} (${r.metrics.owner_draw_section ?? "—"})`,
    );
    setSanityFindings(r.findings);
    if (r.baseline == null) {
      setSanityBaselineLine(
        `baseline 未作成 · 検知オフ — orgos operations financial-audit presentation-sanity --period ${r.period} --update-baseline`,
      );
    } else {
      const hashNow = r.metrics.journal_hash.slice(0, 12);
      const hashBase = r.baseline.journal_hash.slice(0, 12);
      const assetsMatch =
        Math.abs(
          r.baseline.corporate_total_assets_yen - r.metrics.corporate_total_assets_yen,
        ) <= 1;
      setSanityBaselineLine(
        `baseline あり · hash ${hashBase}→${hashNow} · assets ${r.baseline.corporate_total_assets_yen.toLocaleString("ja-JP")}→${r.metrics.corporate_total_assets_yen.toLocaleString("ja-JP")} (${assetsMatch ? "一致" : "差あり"}) · 事業主貸 ${r.baseline.owner_draw_yen ?? "—"}→${r.metrics.owner_draw_yen ?? "—"}`,
      );
    }
  }

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
      lead="CLI 週次・月次ダイジェストを主表示。ライブ操作は下段で遅延読込。e-Tax / eLTAX 本番提出は行いません（ADR 0052）。"
      error={error}
      className="tax-handoff-page"
    >
      <p>
        <span className="badge warn">e-Tax 提出不可</span>
      </p>
      {message && <p className="ops-page-meta">{message}</p>}

      <StaticDigestHeader
        title="税務ダイジェスト"
        slots={slots}
        weeklyEmptyLabel="週次がありません。orgos tax digest --period weekly --write"
        monthlyEmptyLabel="月次がありません。orgos tax digest --period monthly --write"
      />

      <LiveSection aria-label="ライブ税務オペレーション" onVisible={loadLive}>
        <div className="ops-card outlook-panel">
        <h2 className="section-title">ライブ税務オペレーション</h2>

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
        <h2 className="section-title">個人青色 · 表示健全性</h2>
        <p className="ops-page-meta">
          apply / baseline 更新は CLI のみ。Console は確認質問と機械 findings の表示。
        </p>
        <p className="ops-page-meta" role="status">
          {soleSetup ?? "setup 未読込（個人以外は無視可）"}
        </p>
        {soleQuestions.length > 0 && (
          <ul className="ops-list">
            {soleQuestions.slice(0, 8).map((q) => (
              <li key={q.id}>
                <code>{q.id}</code> — {q.prompt}
              </li>
            ))}
          </ul>
        )}
        {soleOptionalQuestions.length > 0 && (
          <>
            <p className="ops-page-meta">任意（ready 非低下）</p>
            <ul className="ops-list">
              {soleOptionalQuestions.map((q) => (
                <li key={q.id}>
                  <code>{q.id}</code> — {q.prompt}
                  {q.hint ? (
                    <>
                      {" "}
                      (<code>{q.hint}</code>)
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
        {deductionsCard && (
          <>
            <h3 className="section-title">所得控除（Form B · 任意）</h3>
            <p className="ops-page-meta">読取のみ。YAML 更新は手編集 / CLI</p>
            {deductionsCard.missing ? (
              <>
                <p className="ops-page-meta">
                  YAML 未整備または対象年不一致（{deductionsCard.year}年）
                </p>
                <p className="ops-page-meta">
                  <code>
                    orgos operations sole-prop-blue deductions status --year{" "}
                    {deductionsCard.year}
                  </code>
                </p>
              </>
            ) : (
              <>
                <p className="ops-page-meta">
                  cap 後合計 {deductionsCard.total.toLocaleString("ja-JP")} 円 ·{" "}
                  {deductionsCard.year}年分
                </p>
                {deductionsCard.lines.length > 0 ? (
                  <ul className="ops-list">
                    {deductionsCard.lines.map((l) => (
                      <li key={l.label}>
                        {l.label}: {l.amount_yen.toLocaleString("ja-JP")} 円
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ops-page-meta">行金額はすべて 0（基礎のみ）</p>
                )}
              </>
            )}
          </>
        )}
        <label className="wallet-field">
          支出確認金額（円）
          <input
            type="number"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
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
                  fetchSolePropExpenseIntakeClarify({
                    amount: Number(expenseAmount),
                  }),
                (r) => {
                  setExpenseClarify(
                    `band ${r.assessment.amount_band} · complete ${r.assessment.complete ? "yes" : "no"} · Q ${r.assessment.clarify_questions.length}`,
                  );
                  return r.boundary;
                },
              )
            }
          >
            支出 clarify
          </button>
        </div>
        {expenseClarify && <p className="ops-page-meta">{expenseClarify}</p>}
        <label className="wallet-field">
          表示健全性 period
          <input
            value={sanityPeriod}
            onChange={(e) => setSanityPeriod(e.target.value)}
          />
        </label>
        <div className="section-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(
                () => fetchPresentationSanity(sanityPeriod),
                (r) => {
                  applySanityResult(r);
                  return `findings ${r.findings.length}`;
                },
              )
            }
          >
            表示健全性を再読込
          </button>
        </div>
        {sanityMeta && <p className="ops-page-meta">{sanityMeta}</p>}
        {sanityBaselineLine && <p className="ops-page-meta">{sanityBaselineLine}</p>}
        {sanityFindings.length > 0 && (
          <ul className="ops-list">
            {sanityFindings.map((f) => (
              <li key={f.code}>
                [{f.level}] <code>{f.code}</code> — {f.message}
              </li>
            ))}
          </ul>
        )}
        <p className="ops-page-meta">
          WP: <code>orgos operations financial-audit workpapers --period {sanityPeriod}</code>
        </p>
        <p className="ops-page-meta">
          baseline 更新:{" "}
          <code>
            orgos operations financial-audit presentation-sanity --period {sanityPeriod}{" "}
            --update-baseline
          </code>
        </p>
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

        </div>
      </LiveSection>

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
