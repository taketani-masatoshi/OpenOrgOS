import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchBankCsvTemplate,
  fetchLedgerAccounts,
  fetchLedgerProposals,
  fetchLedgerWorkbench,
  fetchMonthCloseChecklist,
  fetchDenchoSku,
  fetchDenchoCheck,
  fetchLedgerDenchoSearch,
  postLedgerBankReconcile,
  postLedgerBankReconcileBulkExact,
  postLedgerBankStatementImport,
  postLedgerManualEntry,
  postLedgerPeriod,
  postLedgerProposalApprove,
  postLedgerProposalReject,
  postLedgerReverse,
  postLedgerSource,
  type ElectronicLedgerSearchHit,
  type LedgerJournalProposal,
  type LedgerWorkbenchSnapshot,
  type MonthCloseChecklist,
} from "./api";
import { OPS_PAGES_COPY } from "./ops-pages-copy";
import { OpsPage } from "./OpsPage";

/**
 * Ledger workbench — 4 primary blocks: Today / Trial+PL / Reconcile / Close.
 */
export function LedgerWorkbenchPage() {
  const copy = useCopy(OPS_PAGES_COPY);
  function yen(value: number): string {
    return copy.yen(value.toLocaleString());
  }

  const [asOfInput, setAsOfInput] = useState("");
  const [payload, setPayload] = useState<LedgerWorkbenchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opsMonth, setOpsMonth] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const [monthCloseChecklist, setMonthCloseChecklist] =
    useState<MonthCloseChecklist | null>(null);
  const [denchoPremiumBadge, setDenchoPremiumBadge] = useState(
    "優良要件（タイムスタンプ局）— 別オプション",
  );
  const [accounts, setAccounts] = useState<
    Array<{ code: string; name: string; type: string }>
  >([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showBankAdvanced, setShowBankAdvanced] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<LedgerJournalProposal[]>(
    [],
  );
  const [denchoFrom, setDenchoFrom] = useState("");
  const [denchoTo, setDenchoTo] = useState("");
  const [denchoDesc, setDenchoDesc] = useState("");
  const [denchoHits, setDenchoHits] = useState<ElectronicLedgerSearchHit[]>([]);
  const [denchoCheckSummary, setDenchoCheckSummary] = useState<string | null>(null);

  const [manualEntry, setManualEntry] = useState({
    description: "",
    debit: "5100",
    credit: "1100",
    amount: "10000",
    date: "",
  });

  const [bankCsv, setBankCsv] = useState("");
  const [bankCsvBase64, setBankCsvBase64] = useState<string | null>(null);
  const [bankImportMsg, setBankImportMsg] = useState<string | null>(null);
  const [bankImportHelp, setBankImportHelp] = useState<string | null>(null);
  const [mapDate, setMapDate] = useState("date");
  const [mapAmount, setMapAmount] = useState("amount");
  const [mapDesc, setMapDesc] = useState("description");
  const [mapDirection, setMapDirection] = useState("direction");
  type BankImportStep = "select" | "preview" | "done";
  const [bankStep, setBankStep] = useState<BankImportStep>("select");
  const [bankPreset, setBankPreset] = useState("generic");
  const [bankPresets, setBankPresets] = useState<Array<{ id: string; label: string }>>(
    [],
  );
  const [bankPreview, setBankPreview] = useState<{
    added: number;
    warnings: string[];
    preview_rows?: string[];
  } | null>(null);
  const [useManualMapping, setUseManualMapping] = useState(false);

  function scrollToSection(target: string) {
    document
      .querySelector(`[data-section="${target}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Preset-preferred import body — omit column_mapping unless advanced override. */
  function bankImportPayload(extra: {
    dry_run?: boolean;
    write?: boolean;
  }) {
    return {
      ...(bankCsvBase64
        ? { csv_base64: bankCsvBase64, encoding: "auto" as const }
        : { csv_text: bankCsv }),
      // Preset-preferred: omit column_mapping unless advanced override (then omit preset).
      ...(useManualMapping
        ? {
            column_mapping: {
              date: mapDate,
              amount: mapAmount,
              description: mapDesc,
              direction: mapDirection || undefined,
            },
          }
        : { preset: bankPreset }),
      ...extra,
    };
  }

  
  function bankImportFailureHelp(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return [
      "銀行CSVの取込に失敗しました。",
      msg,
      "",
      "対処:",
      "1. 銀行プリセットを選び直す（みずほ / 三菱UFJ / 三井住友 / ゆうちょ / 楽天）",
      "2. 「テンプレート取得」で正しいヘッダのCSVをダウンロード",
      "3. Shift_JIS の場合はファイルを再選択（自動判定）",
      "4. それでも失敗する場合は詳細の手動列マッピングを使用",
    ].join("\n");
  }

  async function loadPreset(preset: string) {
    setBankPreset(preset);
    const tpl = await fetchBankCsvTemplate(preset);
    setBankPresets(tpl.presets ?? []);
    const m = tpl.suggested_mapping;
    setMapDate(m.date);
    setMapAmount(m.amount);
    setMapDesc(m.description);
    setMapDirection(m.direction ?? "");
  }

  const load = useCallback(async (asOf?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLedgerWorkbench(asOf || undefined);
      setPayload(data);
      setAsOfInput(data.as_of);
      const month = data.as_of.slice(0, 7);
      setOpsMonth((prev) => prev || month);
      setManualEntry((prev) => ({
        ...prev,
        date: prev.date || data.as_of,
      }));
      const [checklist, sku, accts, proposals] = await Promise.all([
        fetchMonthCloseChecklist(month).catch(() => null),
        fetchDenchoSku().catch(() => null),
        fetchLedgerAccounts().catch(() => null),
        fetchLedgerProposals().catch(() => null),
      ]);
      if (checklist) setMonthCloseChecklist(checklist);
      if (sku?.premium?.claim) setDenchoPremiumBadge(sku.premium.claim);
      if (accts?.accounts) setAccounts(accts.accounts);
      if (proposals?.pending) setPendingProposals(proposals.pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBankCsvTemplate("generic")
      .then((tpl) => setBankPresets(tpl.presets ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#proposals") {
      window.setTimeout(() => scrollToSection("sectionProposals"), 100);
    }
  }, [payload]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load(asOfInput || undefined);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadBankTemplate() {
    setBusy(true);
    setActionError(null);
    try {
      const tpl = await fetchBankCsvTemplate(bankPreset);
      setBankPresets(tpl.presets ?? []);
      setBankCsv(tpl.csv_text);
      const m = tpl.suggested_mapping;
      setMapDate(m.date);
      setMapAmount(m.amount);
      setMapDesc(m.description);
      setMapDirection(m.direction ?? "");
      const blob = new Blob([tpl.csv_text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = tpl.filename || "bank-csv-template.csv";
      a.click();
      URL.revokeObjectURL(url);
      setBankImportMsg("テンプレートを読み込みました（ファイルもダウンロード）");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onBankFileSelected(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      setBankCsvBase64(btoa(binary));
      try {
        setBankCsv(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
      } catch {
        setBankCsv("");
      }
      setBankImportMsg(`ファイル読込: ${file.name}`);
      setUseManualMapping(false);
    };
    reader.readAsArrayBuffer(file);
  }

  const nextActions: string[] = [];
  if (payload) {
    if (payload.journals.length === 0) nextActions.push("初回仕訳または手動仕訳を投稿");
    if (payload.bank_reconcile.unmatched_count > 0) {
      nextActions.push(`銀行未消込 ${payload.bank_reconcile.unmatched_count} 件を確認`);
    }
    if (monthCloseChecklist && !monthCloseChecklist.ready) {
      nextActions.push("月次クローズチェックの未完了項目を解消");
    }
    if (pendingProposals.length > 0) {
      nextActions.push(`AI 提案 ${pendingProposals.length} 件を承認または却下`);
    }
    if (payload.unposted_months.length > 0) {
      nextActions.push(`未計上月: ${payload.unposted_months.slice(0, 3).join(", ")}`);
    }
  }

  if (loading && !payload) {
    return (
      <OpsPage
        title={copy.ledgerTitle ?? "帳簿"}
        lead="今日の仕訳・試算表・銀行消込・月次締めをこの画面で進めます。"
        loading
        loadingLabel={copy.loading}
        className="ledger-workbench"
      />
    );
  }

  return (
    <main className="workspace ops-page ledger-workbench">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{copy.ledgerTitle ?? "帳簿"}</h1>
          <p className="ops-page-lead">
            今日の仕訳・試算表・銀行消込・月次締めをこの画面で進めます。
          </p>
        </div>
      </div>
      {error && <p className="error-banner">{error}</p>}
      {actionError && <p className="error-banner">{actionError}</p>}
      {bankImportHelp && (
        <pre className="error-banner" style={{ whiteSpace: "pre-wrap" }}>{bankImportHelp}</pre>
      )}

      {payload && (
        <>
          <section className="ledger-panel" data-section="sectionToday">
            <div className="lf-card module-card-accent" style={{ marginBottom: "var(--space-5)" }}>
              <h2 className="section-title">今日</h2>
              {nextActions.length > 0 ? (
                <p className="page-desc">{nextActions[0]}</p>
              ) : (
                <p className="muted">次アクションはありません</p>
              )}
              <div className="ledger-actions" style={{ gap: "var(--space-2)" }}>
                {pendingProposals.length > 0 && (
                  <button
                    type="button"
                    className="badge"
                    onClick={() => scrollToSection("sectionProposals")}
                  >
                    提案 {pendingProposals.length}
                  </button>
                )}
                {payload.bank_reconcile.unmatched_count > 0 && (
                  <button
                    type="button"
                    className="badge"
                    onClick={() => scrollToSection("sectionReconcile")}
                  >
                    未消込 {payload.bank_reconcile.unmatched_count}
                  </button>
                )}
              </div>
              {nextActions.length > 0 && (
                <p className="section-cta">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const first = nextActions[0] ?? "";
                      if (first.includes("仕訳") || first.includes("提案")) {
                        scrollToSection(
                          first.includes("提案")
                            ? "sectionProposals"
                            : "sectionToday",
                        );
                      } else if (first.includes("銀行") || first.includes("消込")) {
                        scrollToSection("sectionReconcile");
                      } else if (first.includes("クローズ") || first.includes("締め")) {
                        scrollToSection("sectionClose");
                      } else if (payload.journals.length === 0) {
                        window.location.href = "/?onboarding=1";
                      } else {
                        scrollToSection("sectionToday");
                      }
                    }}
                  >
                    {payload.journals.length === 0
                      ? "セットアップへ"
                      : "次のアクションへ"}
                  </button>
                </p>
              )}
              {payload.journals.length === 0 && nextActions.length === 0 && (
                <p className="section-cta">
                  <a className="btn btn-primary btn-sm" href="/?onboarding=1">
                    セットアップへ
                  </a>
                </p>
              )}
            </div>
            {nextActions.length > 1 && (
              <ul>
                {nextActions.slice(1, 3).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {payload.journals.length === 0 && (
              <p className="muted" data-empty="emptyJournals">
                仕訳がまだありません。下の手動仕訳かセットアップから初回仕訳を投稿してください。
              </p>
            )}
            <div className="ledger-actions">
              <label className="muted">
                摘要
                <input
                  value={manualEntry.description}
                  onChange={(e) =>
                    setManualEntry((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </label>
              <label className="muted">
                借方
                <select
                  value={manualEntry.debit}
                  onChange={(e) =>
                    setManualEntry((p) => ({ ...p, debit: e.target.value }))
                  }
                >
                  {(accounts.length
                    ? accounts
                    : [
                        { code: "5100", name: "経費" },
                        { code: "1100", name: "現金" },
                      ]
                  ).map((a) => (
                    <option key={`d-${a.code}`} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                貸方
                <select
                  value={manualEntry.credit}
                  onChange={(e) =>
                    setManualEntry((p) => ({ ...p, credit: e.target.value }))
                  }
                >
                  {(accounts.length
                    ? accounts
                    : [
                        { code: "5100", name: "経費" },
                        { code: "1100", name: "現金" },
                      ]
                  ).map((a) => (
                    <option key={`c-${a.code}`} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                金額
                <input
                  value={manualEntry.amount}
                  onChange={(e) =>
                    setManualEntry((p) => ({ ...p, amount: e.target.value }))
                  }
                />
              </label>
              <label className="muted">
                日付
                <input
                  type="date"
                  value={manualEntry.date.slice(0, 10)}
                  onChange={(e) =>
                    setManualEntry((p) => ({ ...p, date: e.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  void runAction(() =>
                    postLedgerManualEntry({
                      description: manualEntry.description || "手動仕訳",
                      debit_account: manualEntry.debit,
                      credit_account: manualEntry.credit,
                      amount_yen: Number(manualEntry.amount),
                      occurred_at: manualEntry.date
                        ? `${manualEntry.date}T12:00:00.000Z`
                        : undefined,
                    }),
                  )
                }
              >
                仕訳を投稿
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !opsMonth}
                onClick={() =>
                  void runAction(() =>
                    postLedgerSource({
                      source: "onboarding-first",
                      month: opsMonth,
                    }),
                  )
                }
              >
                初回仕訳（オンボ）
              </button>
            </div>

            {pendingProposals.length > 0 && (
              <div className="page-desc" data-section="sectionProposals" id="proposals">
                <h3 className="section-title">AI / MCP 提案キュー</h3>
                {pendingProposals.map((p) => (
                  <div key={p.id} className="ledger-actions">
                    <span className="muted">
                      {p.id}: {p.description} {yen(p.amount_yen)}（{p.debit_account}/
                      {p.credit_account}）
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await postLedgerProposalApprove(p.id);
                        })
                      }
                    >
                      提案を承認して投稿
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await postLedgerProposalReject(p.id);
                        })
                      }
                    >
                      却下
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ledger-panel" data-section="sectionTrialBalance">
            <h2 className="section-title">試算表・損益</h2>
            <div className="ledger-actions">
              <label className="muted">
                as_of
                <input
                  type="date"
                  value={asOfInput.slice(0, 10)}
                  onChange={(e) => setAsOfInput(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void load(asOfInput || undefined)}
              >
                再読込
              </button>
            </div>
            {payload.trial_balance.rows.length === 0 ? (
              <p className="muted">
                試算表行がありません{" "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => scrollToSection("sectionToday")}
                >
                  手動仕訳へ
                </button>
              </p>
            ) : (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>科目</th>
                    <th>残高</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.trial_balance.rows.slice(0, 20).map((row) => (
                    <tr key={row.account_code}>
                      <td>
                        {row.account_code} {row.account_name}
                      </td>
                      <td>{yen(row.balance_yen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 className="section-title">科目別 PL</h3>
            {!payload.profit_and_loss_lines?.length ? (
              <p className="muted">損益行がありません</p>
            ) : (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>科目</th>
                    <th>ラベル</th>
                    <th>金額</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.profit_and_loss_lines.map((row, i) => (
                    <tr key={`${row.account_code ?? row.label}-${i}`}>
                      <td>{row.account_code ?? "—"}</td>
                      <td>{row.label}</td>
                      <td>{yen(row.amount_yen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="ledger-panel" data-section="sectionReconcile">
            <h2 className="section-title">消込（銀行）</h2>
            <div
              className="lf-card"
              data-bank-step={bankStep}
              style={{ marginBottom: "var(--space-4)" }}
            >
              {bankStep === "select" && (
                <>
                  <p className="muted">ステップ 1/3: ファイルを選択</p>
                  <div className="ledger-actions">
                    <label className="muted">
                      銀行プリセット
                      <select
                        value={bankPreset}
                        onChange={(e) => void loadPreset(e.target.value)}
                      >
                        {(bankPresets.length
                          ? bankPresets
                          : [
                              { id: "generic", label: "汎用" },
                              { id: "mizuho", label: "みずほ" },
                              { id: "mufg", label: "三菱UFJ" },
                              { id: "smbc", label: "三井住友" },
                            ]
                        ).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void downloadBankTemplate()}
                    >
                      テンプレート取得
                    </button>
                    <label className="muted">
                      CSV ファイル
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) =>
                          onBankFileSelected(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || (!bankCsv.trim() && !bankCsvBase64)}
                      onClick={() =>
                        void runAction(async () => {
                          setBankImportHelp(null);
                          try {
                            const result = await postLedgerBankStatementImport(
                              bankImportPayload({ dry_run: true }),
                            );
                            setBankPreview({
                              added: result.added,
                              warnings: result.warnings,
                              preview_rows: result.preview_rows,
                            });
                            setBankStep("preview");
                          } catch (err) {
                            setBankImportHelp(bankImportFailureHelp(err));
                            throw err;
                          }
                        })
                      }
                    >
                      プレビュー
                    </button>
                  </div>
                </>
              )}
              {bankStep === "preview" && bankPreview && (
                <>
                  <p className="muted">ステップ 2/3: プレビュー（{bankPreview.added} 件）</p>
                  {bankPreview.warnings.length > 0 && (
                    <ul>
                      {bankPreview.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <pre className="muted">
                    {(bankPreview.preview_rows ?? []).join("\n")}
                  </pre>
                  <div className="ledger-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setBankStep("select")}
                    >
                      戻る
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          setBankImportHelp(null);
                          try {
                            const result = await postLedgerBankStatementImport(
                              bankImportPayload({ write: true }),
                            );
                            setBankImportMsg(
                              `取込 ${result.added} 件 (batch ${result.batch_id})`,
                            );
                            setBankCsv("");
                            setBankCsvBase64(null);
                            setBankPreview(null);
                            setBankStep("done");
                          } catch (err) {
                            setBankImportHelp(bankImportFailureHelp(err));
                            throw err;
                          }
                        })
                      }
                    >
                      取込実行
                    </button>
                  </div>
                </>
              )}
              {bankStep === "done" && (
                <>
                  <p className="muted">ステップ 3/3: 取込完了</p>
                  {bankImportMsg && <p className="muted">{bankImportMsg}</p>}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setBankStep("select");
                      scrollToSection("sectionReconcile");
                    }}
                  >
                    続けて消込
                  </button>
                </>
              )}
            </div>
            {showBankAdvanced && (
              <details className="page-desc" open>
                <summary className="muted">詳細: CSV 直接入力・列マッピング上書き</summary>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={useManualMapping}
                    onChange={(e) => setUseManualMapping(e.target.checked)}
                  />{" "}
                  手動列マッピングを使う（プリセットより優先しない — API は preset 優先）
                </label>
                <textarea
                  rows={4}
                  value={bankCsv}
                  onChange={(e) => {
                    setBankCsv(e.target.value);
                    setBankCsvBase64(null);
                  }}
                />
              </details>
            )}
            <div className="ledger-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowBankAdvanced((v) => !v)}
              >
                {showBankAdvanced ? "詳細入力を隠す" : "詳細入力"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  void runAction(() => postLedgerBankReconcileBulkExact())
                }
              >
                完全一致を一括承認
              </button>
            </div>
            {bankImportMsg && <p className="muted">{bankImportMsg}</p>}
            <p className="muted">
              未消込 {payload.bank_reconcile.unmatched_count} · 提案{" "}
              {payload.bank_reconcile.proposals.length}
            </p>
            {payload.bank_reconcile.proposals.slice(0, 5).map((p) => (
              <div
                key={`${p.bank_statement_id}-${p.ar_ap_id}`}
                className="ledger-actions"
              >
                <span className="muted">
                  {p.bank_statement_id} ↔ {p.ar_ap_id} {yen(p.amount)} ({p.confidence})
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void runAction(() =>
                      postLedgerBankReconcile({
                        bank_id: p.bank_statement_id,
                        ar_ap_id: p.ar_ap_id,
                        amount: p.amount,
                      }),
                    )
                  }
                >
                  承認
                </button>
              </div>
            ))}
          </section>

          <section className="ledger-panel" data-section="sectionClose">
            <h2 className="section-title">締め</h2>
            {monthCloseChecklist && (
              <div className="page-desc">
                <p className="muted">
                  月次クローズチェック（{monthCloseChecklist.month}）—{" "}
                  {monthCloseChecklist.checklist_complete ?? monthCloseChecklist.ready
                    ? "チェック項目完了"
                    : "未完了あり"}
                  {monthCloseChecklist.period_locked
                    ? " · 期間ロック済み"
                    : " · 期間ロックは別操作"}
                </p>
                <ul>
                  {monthCloseChecklist.items.map((item) => (
                    <li key={item.id}>
                      {item.pass ? "✓" : "·"} {item.label}
                      {item.detail ? ` — ${item.detail}` : ""}
                      {!item.pass && item.scroll_target && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => scrollToSection(item.scroll_target!)}
                        >
                          対応する
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {monthCloseChecklist.unmatched_samples &&
                  monthCloseChecklist.unmatched_samples.length > 0 && (
                    <ul>
                      {monthCloseChecklist.unmatched_samples.map((s) => (
                        <li key={s.bank_statement_id}>
                          未消込 {s.bank_statement_id}: {yen(s.amount)}{" "}
                          {s.description ?? ""}
                          {s.suggested_ar_ap_id ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() =>
                                void runAction(() =>
                                  postLedgerBankReconcile({
                                    bank_id: s.bank_statement_id,
                                    ar_ap_id: s.suggested_ar_ap_id!,
                                    amount: s.amount,
                                  }),
                                )
                              }
                            >
                              消込承認
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => scrollToSection("sectionReconcile")}
                            >
                              消込へ
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                {monthCloseChecklist.fix_hints &&
                  monthCloseChecklist.fix_hints.length > 0 && (
                    <ul>
                      {monthCloseChecklist.fix_hints.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                {monthCloseChecklist.integrity_errors &&
                  monthCloseChecklist.integrity_errors.length > 0 && (
                    <div className="error-banner">
                      <p>帳簿整合性エラー（この画面で確認）:</p>
                      <ul>
                        {monthCloseChecklist.integrity_errors.map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
            {payload.prior_compare && (
              <p className="muted">
                前期比較 純利益 {yen(payload.prior_compare.net_profit.current)}（前期{" "}
                {yen(payload.prior_compare.net_profit.prior)}）
              </p>
            )}
            <div className="ledger-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !opsMonth}
                onClick={() =>
                  void runAction(() =>
                    postLedgerPeriod({
                      month: opsMonth,
                      action: "lock",
                      require_checklist: true,
                    }),
                  )
                }
              >
                期間ロック（CL 必須）
              </button>
              <input
                type="text"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="ロック解除の理由（必須）"
                aria-label="ロック解除の理由"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !opsMonth || !unlockReason.trim()}
                onClick={() =>
                  void runAction(async () => {
                    const result = await postLedgerPeriod({
                      month: opsMonth,
                      action: "unlock",
                      reason: unlockReason.trim(),
                    });
                    setUnlockReason("");
                    return result;
                  })
                }
              >
                ロック解除
              </button>
            </div>
            <p className="muted">
              <span className="badge">{denchoPremiumBadge}</span>
            </p>
            <div className="section-actions">
              <a className="btn btn-primary btn-sm" href="/?tax=1">
                税務モジュール
              </a>
            </div>
          </section>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? "詳細を隠す" : "詳細（税・電帳・補助元帳）"}
          </button>
          {showDetails && (
            <section className="ledger-panel" data-section="sectionDetails">
              <h2 className="section-title">詳細</h2>
              <p className="muted">
                BS 資産 {yen(payload.balance_sheet.total_assets_yen)} · CF 純増減{" "}
                {yen(payload.cash_flow.net_cash_change_yen)}
              </p>
              <h3 className="section-title">税残高</h3>
              <ul>
                {payload.tax_balances.map((row) => (
                  <li key={row.account_code}>
                    {row.label}: {yen(row.balance_yen)}
                  </li>
                ))}
              </ul>
              {payload.remittance_calendar.length > 0 && (
                <>
                  <h3 className="section-title">納付カレンダー（帳簿）</h3>
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>期限</th>
                        <th>見積</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.remittance_calendar.slice(0, 12).map((row) => (
                        <tr key={row.row_id}>
                          <td>{row.label}</td>
                          <td>{row.deadline}</td>
                          <td>
                            {row.amount_estimate_jpy != null
                              ? yen(row.amount_estimate_jpy)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <h3 className="section-title">補助元帳</h3>
              {payload.subsidiaries.length === 0 ? (
                <p className="muted">補助元帳行はありません</p>
              ) : (
                payload.subsidiaries.map((sub) => (
                  <div key={sub.account_code}>
                    <p>
                      {sub.account_code} {sub.account_name}{" "}
                      {sub.balanced ? "一致" : "不一致"} · 統制{" "}
                      {yen(sub.control_balance_yen)}
                    </p>
                    {sub.lines.length > 0 && (
                      <table className="ledger-table">
                        <thead>
                          <tr>
                            <th>相手先</th>
                            <th>残高</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sub.lines.map((line) => (
                            <tr key={line.counterparty_id}>
                              <td>{line.counterparty_id}</td>
                              <td>{yen(line.balance_yen)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              )}
              <h3 className="section-title">仕訳の逆仕訳</h3>
              {payload.journals.length === 0 ? (
                <p className="muted">仕訳がありません</p>
              ) : (
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>日付</th>
                      <th>摘要</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.journals.slice(0, 20).map((je) => (
                      <tr key={je.entry_id}>
                        <td>
                          <code>{je.entry_id}</code>
                        </td>
                        <td>{je.occurred_at.slice(0, 10)}</td>
                        <td>{je.description}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void runAction(() =>
                                postLedgerReverse({ entry_id: je.entry_id }),
                              )
                            }
                          >
                            逆仕訳
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3 className="section-title">電帳検索</h3>
              <p className="muted">{denchoCheckSummary ?? "コンプライアンス未取得"}</p>
              <div className="ledger-actions">
                <label className="muted">
                  開始
                  <input
                    type="date"
                    value={denchoFrom}
                    onChange={(e) => setDenchoFrom(e.target.value)}
                  />
                </label>
                <label className="muted">
                  終了
                  <input
                    type="date"
                    value={denchoTo}
                    onChange={(e) => setDenchoTo(e.target.value)}
                  />
                </label>
                <label className="muted">
                  摘要
                  <input
                    value={denchoDesc}
                    onChange={(e) => setDenchoDesc(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const [search, check] = await Promise.all([
                        fetchLedgerDenchoSearch({
                          from: denchoFrom || undefined,
                          to: denchoTo || undefined,
                          description: denchoDesc || undefined,
                        }),
                        fetchDenchoCheck(),
                      ]);
                      setDenchoHits(search.hits);
                      setDenchoCheckSummary(
                        check.issues.length === 0
                          ? `電帳 OK · ${check.entry_count} 件`
                          : `電帳 指摘 ${check.issues.length} · ${check.issues[0]}`,
                      );
                    })
                  }
                >
                  検索
                </button>
              </div>
              {denchoHits.length > 0 && (
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>仕訳</th>
                      <th>科目</th>
                      <th>摘要</th>
                      <th>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {denchoHits.map((hit, i) => (
                      <tr key={`${hit.entry_id}-${hit.account_code}-${i}`}>
                        <td>
                          <code>{hit.entry_id}</code>
                        </td>
                        <td>{hit.account_code}</td>
                        <td>{hit.description}</td>
                        <td>{yen(hit.line_amount_yen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
