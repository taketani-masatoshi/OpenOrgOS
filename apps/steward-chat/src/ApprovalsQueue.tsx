import { useCallback, useEffect, useMemo, useState } from "react";
import { approveWithSettlementCeremony } from "@ops-shared/settlement-stepup-client";
import { useSettlementStepUp } from "@ops-shared/use-settlement-stepup";
import { webauthnUserMessage } from "@ops-shared/webauthn-user-error";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  answerCeoQuestion,
  chatApi,
  fetchApprovals,
  fetchAuthConfig,
  fetchCeoQuestions,
  fetchConfigApprovalPreview,
  fetchSchedulingApprovalPreview,
  postApprovalPropose,
  rejectConfigChange,
  type CeoInlineQuestion,
  type SchedulingApprovalPreview,
  type TenantConfigPreview,
  type TodayApprovalItem,
} from "./api";
import { OpsExecutionPanels } from "./OpsExecutionPanels";
import { ExpenseClaimApprovals } from "./ExpenseClaimApprovals";

function isTenantConfig(item: TodayApprovalItem): boolean {
  return item.subject_type === "tenant.config";
}

function isCorrespondence(item: TodayApprovalItem): boolean {
  return Boolean(item.subject_type?.startsWith("correspondence."));
}

function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * CEO approval inbox — tenant.config, correspondence, scheduling, CEO questions.
 */
export function ApprovalsQueue({ asPage = false }: { asPage?: boolean }) {
  const copy = useCopy(STEWARD_COPY);
  const [items, setItems] = useState<TodayApprovalItem[]>([]);
  const [ceoQuestions, setCeoQuestions] = useState<CeoInlineQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TenantConfigPreview>>(
    {},
  );
  const [schedPreviews, setSchedPreviews] = useState<
    Record<string, SchedulingApprovalPreview>
  >({});
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [settlementCount, setSettlementCount] = useState<number | null>(null);
  const [proposeType, setProposeType] = useState("org.internal");
  const [proposeRef, setProposeRef] = useState("");
  const [proposeMessage, setProposeMessage] = useState("");
  const [proposeAmount, setProposeAmount] = useState("");
  const { runCeremony, modal } = useSettlementStepUp(chatApi);
  const highlightId = useMemo(() => queryParam("id"), []);
  const highlightCeoQ = useMemo(() => queryParam("ceo_question"), []);

  const reload = useCallback(async () => {
    try {
      const [rows, auth, questions] = await Promise.all([
        fetchApprovals(),
        fetchAuthConfig(),
        fetchCeoQuestions().catch(() => [] as CeoInlineQuestion[]),
      ]);
      setItems(rows);
      setSettlementCount(auth.webauthn?.settlement_count ?? 0);
      setCeoQuestions(questions.filter((q) => q.status === "pending"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const configItems = items.filter(isTenantConfig);
  const configIds = configItems.map((i) => i.id).join(",");
  const correspondenceItems = items.filter(isCorrespondence);
  const correspondenceIds = correspondenceItems.map((i) => i.id).join(",");

  useEffect(() => {
    for (const item of configItems) {
      if (previews[item.id]) continue;
      void fetchConfigApprovalPreview(item.id)
        .then((preview) => {
          setPreviews((prev) => ({ ...prev, [item.id]: preview }));
        })
        .catch(() => {
          /* preview optional until approve */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when id set changes
  }, [configIds]);

  useEffect(() => {
    for (const item of correspondenceItems) {
      if (schedPreviews[item.id]) continue;
      void fetchSchedulingApprovalPreview(item.id)
        .then((preview) => {
          setSchedPreviews((prev) => ({ ...prev, [item.id]: preview }));
        })
        .catch(() => {
          /* not all correspondence is scheduling */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correspondenceIds]);

  const empty =
    items.length === 0 && ceoQuestions.length === 0 && !error && !modal;
  if (!asPage && empty) return null;

  const settlementPasskeyMissing = settlementCount === 0;

  async function onApprove(id: string) {
    if (settlementPasskeyMissing) {
      setError(copy.settlementPasskeyRequired);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await approveWithSettlementCeremony({
        api: chatApi,
        approvalId: id,
        tryApprove: () =>
          chatApi(`/chat/v1/approvals/${encodeURIComponent(id)}/approve`, {
            method: "POST",
            body: JSON.stringify({ flush: true, reviewed: true }),
          }),
        runCeremony,
      });
      await reload();
    } catch (err) {
      setError(webauthnUserMessage(err, { purpose: "settlement" }));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await rejectConfigChange(id, "rejected from CEO inbox");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onPropose() {
    setBusyId("propose");
    setError(null);
    try {
      const amount = Number(proposeAmount);
      await postApprovalPropose({
        subject_type: proposeType.trim(),
        subject_ref: proposeRef.trim() || undefined,
        message: proposeMessage.trim() || undefined,
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      });
      setProposeRef("");
      setProposeMessage("");
      setProposeAmount("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onAnswerCeo(q: CeoInlineQuestion) {
    setBusyId(q.id);
    setError(null);
    try {
      const fields = answers[q.id] ?? {};
      for (const f of q.fields) {
        if (!fields[f.id]?.trim()) {
          throw new Error(`${f.label} が未入力です`);
        }
      }
      await answerCeoQuestion(q.id, fields);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {modal}
      <section
        className={asPage ? "approvals-inbox" : "approvals-queue"}
        aria-label={copy.approvalsLabel}
      >
        <header className={asPage ? "page-heading" : "approvals-queue-header"}>
          <div>
            <h1 className={asPage ? "ops-page-title" : "approvals-queue-title"}>
              {copy.approvalsTitle}
            </h1>
            {asPage ? <p className="ops-page-lead">{copy.approvalsLead}</p> : null}
          </div>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void reload()}
          >
            {copy.refresh}
          </button>
        </header>
        {error && <div className="error-banner">{error}</div>}
        {asPage ? (
          <form
            className="approvals-propose"
            onSubmit={(e) => {
              e.preventDefault();
              void onPropose();
            }}
          >
            <h2 className="section-title">稟議を起案</h2>
            <p className="ops-page-meta">
              起案のみです。承認は CEO が Settlement PassKey で行います。
            </p>
            <label className="wallet-field">
              種別
              <select
                value={proposeType}
                onChange={(e) => setProposeType(e.target.value)}
              >
                <option value="org.internal">org.internal</option>
                <option value="contract.fee">contract.fee</option>
                <option value="finance.payment">finance.payment</option>
                <option value="org.meeting">org.meeting</option>
              </select>
            </label>
            <label className="wallet-field">
              参照
              <input
                value={proposeRef}
                onChange={(e) => setProposeRef(e.target.value)}
                placeholder="CTR-022"
              />
            </label>
            <label className="wallet-field">
              内容
              <input
                value={proposeMessage}
                onChange={(e) => setProposeMessage(e.target.value)}
                placeholder="起案の要旨"
              />
            </label>
            <label className="wallet-field">
              金額（任意）
              <input
                type="number"
                min="0"
                value={proposeAmount}
                onChange={(e) => setProposeAmount(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busyId === "propose" || !proposeType.trim()}
            >
              {busyId === "propose" ? copy.approving : "起案する"}
            </button>
          </form>
        ) : null}
        {settlementPasskeyMissing && items.length > 0 ? (
          <p className="approvals-queue-muted">
            {copy.settlementPasskeyRequired}{" "}
            <a href="/settings/">{copy.settlementPasskeySettingsLink}</a>
          </p>
        ) : null}

        {ceoQuestions.length > 0 ? (
          <div className="approvals-ceo-questions">
            <h2 className="section-title">{copy.ceoQuestionsTitle}</h2>
            <ul className="approvals-queue-list">
              {ceoQuestions.map((q) => {
                const highlighted = highlightCeoQ === q.id;
                return (
                  <li
                    key={q.id}
                    className={
                      highlighted
                        ? "approvals-queue-item is-highlight"
                        : "approvals-queue-item"
                    }
                    id={`ceo-q-${q.id}`}
                  >
                    <p className="approvals-queue-kind">ceo.question</p>
                    <p className="approvals-queue-message">{q.subject}</p>
                    <p className="approvals-queue-muted">{q.context_l1}</p>
                    <div className="approvals-ceo-fields">
                      {q.fields.map((f) => (
                        <label key={f.id} className="approvals-ceo-field">
                          <span>{f.label}</span>
                          {f.type === "choice" && f.choices?.length ? (
                            <select
                              value={answers[q.id]?.[f.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    ...(prev[q.id] ?? {}),
                                    [f.id]: e.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">{copy.selectPlease}</option>
                              {f.choices.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : f.type === "yes_no" || f.type === "yes_no_unknown" ? (
                            <select
                              value={answers[q.id]?.[f.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    ...(prev[q.id] ?? {}),
                                    [f.id]: e.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">{copy.selectPlease}</option>
                              <option value="yes">yes</option>
                              <option value="no">no</option>
                              {f.type === "yes_no_unknown" ? (
                                <option value="unknown">unknown</option>
                              ) : null}
                            </select>
                          ) : (
                            <input
                              type={f.type === "time" ? "time" : "text"}
                              value={answers[q.id]?.[f.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    ...(prev[q.id] ?? {}),
                                    [f.id]: e.target.value,
                                  },
                                }))
                              }
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="approvals-queue-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === q.id}
                        onClick={() => void onAnswerCeo(q)}
                      >
                        {busyId === q.id ? copy.approving : copy.ceoQuestionAnswer}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {asPage ? <ExpenseClaimApprovals /> : null}

        {items.length === 0 && ceoQuestions.length === 0 && !error ? (
          <p className="approvals-queue-muted">{copy.approvalsEmpty}</p>
        ) : items.length > 0 ? (
          <ul className="approvals-queue-list">
            {items.map((item) => {
              const preview = previews[item.id];
              const sched = schedPreviews[item.id];
              const config = isTenantConfig(item);
              const correspondence = isCorrespondence(item);
              const highlighted = highlightId === item.id;
              return (
                <li
                  key={item.id}
                  id={`apr-${item.id}`}
                  className={
                    highlighted
                      ? "approvals-queue-item is-highlight"
                      : "approvals-queue-item"
                  }
                >
                  {item.subject_type ? (
                    <p className="approvals-queue-kind">{item.subject_type}</p>
                  ) : null}
                  <p className="approvals-queue-message">
                    {item.message ?? item.subject}
                  </p>
                  {config ? (
                    preview ? (
                      <>
                        <p className="approvals-queue-diff">
                          <code>{preview.diff_line}</code>
                        </p>
                        <ul className="approvals-queue-effects">
                          {preview.side_effects_plan.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="approvals-queue-muted">{copy.previewLoading}</p>
                    )
                  ) : null}
                  {correspondence && sched ? (
                    <details className="approvals-preview-toggle">
                      <summary>{copy.previewToggle}</summary>
                      <pre className="approvals-sched-preview">{sched.preview}</pre>
                    </details>
                  ) : null}
                  <div className="approvals-queue-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === item.id || settlementPasskeyMissing}
                      onClick={() => void onApprove(item.id)}
                    >
                      {busyId === item.id ? copy.approving : copy.approveApply}
                    </button>
                    {config ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === item.id}
                        onClick={() => void onReject(item.id)}
                      >
                        {copy.reject}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {asPage ? <OpsExecutionPanels /> : null}
      </section>
    </>
  );
}
