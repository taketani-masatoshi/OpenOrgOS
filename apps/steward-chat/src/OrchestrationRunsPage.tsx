import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  cancelOrchestrationRun,
  completeOrchestrationRun,
  fetchOrchestrationRun,
  fetchOrchestrationRuns,
  reopenOrchestrationRun,
  retryOrchestrationRun,
  type BoardCard,
  type BoardColumn,
  type BoardPlanSummary,
  type OrchestrationRunPayload,
} from "./api";
import { OPS_PAGES_COPY } from "./ops-pages-copy";
import "./orchestration-runs.css";

const BOARD_COLUMNS: BoardColumn[] = ["attention", "todo", "waiting", "active", "done"];

type ViewMode = "incomplete" | "completed" | "all";
type GroupMode = "plan" | "agent" | "work_kind" | "due";
type DueBucket = "overdue" | "today" | "soon" | "later" | "none";

function statusTone(status: string): string {
  if (status === "completed") return "is-done";
  if (status === "failed" || status === "blocked") return "is-alert";
  if (status === "running" || status === "dispatched") return "is-active";
  return "is-idle";
}

function workKindLabel(kind: string | null, unknownLabel: string): string {
  if (!kind) return unknownLabel;
  return kind;
}

function dueBucket(due?: string): DueBucket {
  if (!due) return "none";
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return "overdue";
  if (due === today) return "today";
  const week = new Date();
  week.setUTCDate(week.getUTCDate() + 7);
  if (due <= week.toISOString().slice(0, 10)) return "soon";
  return "later";
}

function groupCards(
  cards: BoardCard[],
  mode: GroupMode,
  dueLabel: Record<DueBucket, string>,
): Array<{ key: string; label: string; cards: BoardCard[] }> {
  const map = new Map<string, BoardCard[]>();
  for (const card of cards) {
    let key: string;
    switch (mode) {
      case "agent":
        key = card.agent;
        break;
      case "work_kind":
        key = card.work_kind ?? "";
        break;
      case "due":
        key = dueBucket(card.due_date);
        break;
      default:
        key = card.rootId;
        break;
    }
    const list = map.get(key) ?? [];
    list.push(card);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupCards]) => ({
      key,
      label:
        mode === "due"
          ? dueLabel[key as DueBucket] ?? key
          : mode === "work_kind" && !key
            ? dueLabel.none
            : key,
      cards: groupCards,
    }));
}

export function OrchestrationRunsPage() {
  const copy = useCopy(OPS_PAGES_COPY);
  const columnLabel: Record<BoardColumn, string> = {
    attention: copy.columnAttention,
    todo: copy.columnTodo,
    waiting: copy.columnWaiting,
    active: copy.columnActive,
    done: copy.columnDone,
  };
  const statusLabel: Record<string, string> = {
    pending: copy.statusPending,
    waiting: copy.statusWaiting,
    dispatched: copy.statusDispatched,
    running: copy.statusRunning,
    completed: copy.statusCompleted,
    failed: copy.statusFailed,
    blocked: copy.statusBlocked,
  };
  const dueLabel: Record<DueBucket, string> = {
    overdue: copy.dueOverdue,
    today: copy.dueToday,
    soon: copy.dueSoon,
    later: copy.dueLater,
    none: copy.dueNone,
  };

  const [plans, setPlans] = useState<BoardPlanSummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detailRootId, setDetailRootId] = useState<string | null>(null);
  const [payload, setPayload] = useState<OrchestrationRunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"retry" | "cancel" | "complete" | "reopen" | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("incomplete");
  const [groupMode, setGroupMode] = useState<GroupMode>("plan");
  const [filterMode, setFilterMode] = useState<"all" | "attention">("all");
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterWorkKind, setFilterWorkKind] = useState<string>("");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showCompletedPlans, setShowCompletedPlans] = useState(false);

  const loadBoard = useCallback(async () => {
    const list = await fetchOrchestrationRuns({
      includeCompleted: viewMode !== "incomplete",
      view: viewMode,
    });
    setPlans(list.plans ?? []);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadBoard();
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBoard]);

  const activePlans = useMemo(() => plans.filter((p) => p.status === "active"), [plans]);
  const completedPlans = useMemo(() => plans.filter((p) => p.status === "completed"), [plans]);

  const visiblePlans = useMemo(() => {
    if (!selectedPlanId) return plans;
    return plans.filter((p) => p.id === selectedPlanId);
  }, [plans, selectedPlanId]);

  const allCards = useMemo(
    () => visiblePlans.flatMap((plan) => plan.cards),
    [visiblePlans],
  );

  const agentOptions = useMemo(
    () => [...new Set(allCards.map((c) => c.agent))].sort(),
    [allCards],
  );

  const workKindOptions = useMemo(
    () =>
      [...new Set(allCards.map((c) => c.work_kind ?? ""))].filter(Boolean).sort(),
    [allCards],
  );

  const filteredCards = useMemo(() => {
    return allCards.filter((card) => {
      if (filterMode === "attention" && card.column !== "attention") return false;
      if (filterAgent && card.agent !== filterAgent) return false;
      if (filterWorkKind && (card.work_kind ?? "") !== filterWorkKind) return false;
      return true;
    });
  }, [allCards, filterMode, filterAgent, filterWorkKind]);

  const visibleColumns = useMemo(() => {
    let cols = BOARD_COLUMNS;
    if (viewMode === "incomplete") cols = cols.filter((c) => c !== "done");
    if (hideEmpty) {
      const withCards = new Set(filteredCards.map((c) => c.column));
      cols = cols.filter((col) => withCards.has(col));
    }
    return cols;
  }, [filteredCards, hideEmpty, viewMode]);

  const cardsByColumn = useCallback(
    (cards: BoardCard[]) => {
      const grouped = Object.fromEntries(
        BOARD_COLUMNS.map((col) => [col, [] as BoardCard[]]),
      ) as Record<BoardColumn, BoardCard[]>;
      for (const card of cards) {
        grouped[card.column]?.push(card);
      }
      return grouped;
    },
    [],
  );

  const boardGroups = useMemo(() => {
    if (groupMode === "plan" && !selectedPlanId) {
      return visiblePlans.map((plan) => ({
        key: plan.id,
        label: plan.title,
        cards: plan.cards.filter((card) =>
          filteredCards.some((fc) => fc.id === card.id),
        ),
      }));
    }
    return groupCards(filteredCards, groupMode, dueLabel);
  }, [filteredCards, groupMode, selectedPlanId, visiblePlans, dueLabel]);

  const selectedCard = useMemo(
    () => allCards.find((c) => c.id === selectedCardId) ?? null,
    [allCards, selectedCardId],
  );

  const loadDetail = useCallback(async (rootId: string) => {
    const data = await fetchOrchestrationRun(rootId);
    setPayload(data);
    setDetailRootId(rootId);
  }, []);

  useEffect(() => {
    if (!selectedCard) {
      setPayload(null);
      setDetailRootId(null);
      return;
    }
    let cancelled = false;
    let pollTimer = 0;

    const refresh = async () => {
      try {
        await loadDetail(selectedCard.rootId);
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    void refresh();

    const source = new EventSource(
      `/chat/v1/orchestration/runs/stream?id=${encodeURIComponent(selectedCard.rootId)}`,
    );
    source.onmessage = (event) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          payload?: OrchestrationRunPayload;
        };
        if (msg.type === "orchestration_status" && msg.payload) {
          setPayload(msg.payload);
        }
      } catch {
        /* ignore malformed SSE frame */
      }
    };
    source.onerror = () => {
      if (cancelled || pollTimer !== 0) return;
      source.close();
      pollTimer = window.setInterval(() => void refresh(), 5000);
    };

    return () => {
      cancelled = true;
      source.close();
      if (pollTimer !== 0) window.clearInterval(pollTimer);
    };
  }, [selectedCard, loadDetail]);

  async function act(kind: "retry" | "cancel") {
    const rootId = detailRootId ?? selectedCard?.rootId;
    if (!rootId || busy) return;
    if (
      !window.confirm(
        kind === "retry" ? copy.confirmRetry(rootId) : copy.confirmCancel(rootId),
      )
    ) {
      return;
    }
    setBusy(kind);
    try {
      const next =
        kind === "retry"
          ? await retryOrchestrationRun(rootId)
          : await cancelOrchestrationRun(rootId);
      setPayload(next);
      setError(null);
      await loadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleComplete(card: BoardCard) {
    if (busy) return;
    const willComplete = !card.closed;
    if (
      !window.confirm(
        willComplete ? copy.confirmComplete(card.title) : copy.confirmReopen(card.title),
      )
    ) {
      return;
    }
    setBusy(willComplete ? "complete" : "reopen");
    try {
      if (willComplete) {
        await completeOrchestrationRun(card.id);
      } else {
        await reopenOrchestrationRun(card.id);
      }
      setError(null);
      await loadBoard();
      if (selectedCardId === card.id && viewMode === "incomplete" && willComplete) {
        setSelectedCardId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function renderKanban(cards: BoardCard[]) {
    const grouped = cardsByColumn(cards);
    const cols =
      hideEmpty && cards.length > 0
        ? visibleColumns.filter((col) => grouped[col].length > 0)
        : visibleColumns;

    if (cols.length === 0) return null;

    return (
      <div className="orchestration-kanban">
        {cols.map((col) => (
          <section key={col} className="orchestration-kanban-column">
            <header className="orchestration-kanban-column-head">
              <h3>{columnLabel[col]}</h3>
              <span className="orchestration-kanban-count">{grouped[col].length}</span>
            </header>
            <div className="orchestration-kanban-cards">
              {grouped[col].map((card) => (
                <div
                  key={card.id}
                  className={
                    selectedCardId === card.id
                      ? "orchestration-kanban-card-wrap is-selected"
                      : "orchestration-kanban-card-wrap"
                  }
                >
                  <button
                    type="button"
                    className={
                      card.closed
                        ? "orchestration-complete-toggle is-done"
                        : "orchestration-complete-toggle"
                    }
                    aria-label={card.closed ? copy.reopenTask : copy.completeTask}
                    disabled={busy !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleComplete(card);
                    }}
                  >
                    {card.closed ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    className={
                      card.closed
                        ? "orchestration-kanban-card is-closed"
                        : "orchestration-kanban-card"
                    }
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    <span className="orchestration-kanban-card-title">{card.title}</span>
                    <span className="orchestration-kanban-card-tags">
                      <span className="orchestration-tag">
                        {workKindLabel(card.work_kind, copy.workKindUnknown)}
                      </span>
                      <span className="orchestration-tag">{card.agent}</span>
                    </span>
                    {card.depends_on.length > 0 && card.column === "waiting" ? (
                      <span className="orchestration-kanban-card-hint muted">
                        {copy.waitingOn(card.depends_on[0]?.title ?? card.depends_on[0]?.id ?? "")}
                      </span>
                    ) : null}
                    {card.due_date ? (
                      <span className="orchestration-kanban-card-hint muted">
                        {copy.dueDate}: {card.due_date}
                      </span>
                    ) : null}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  /**
   * Rendered both inside the board and in the empty state: completing (or
   * reopening) the last work order empties the current view, and without the
   * chips there is no way back to the other one.
   */
  const viewModeChips = (
    <>
      {(["incomplete", "completed", "all"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={
            viewMode === mode ? "orchestration-filter-chip is-active" : "orchestration-filter-chip"
          }
          onClick={() => setViewMode(mode)}
        >
          {mode === "incomplete"
            ? copy.viewIncomplete
            : mode === "completed"
              ? copy.viewCompleted
              : copy.viewAll}
        </button>
      ))}
    </>
  );

  const hasAnyPlan = plans.length > 0;
  const hasVisibleCards = filteredCards.length > 0;
  const useSwimlanes = groupMode === "plan" && !selectedPlanId;

  return (
    <main className="workspace orchestration-runs">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{copy.runsTitle}</h1>
          <p className="ops-page-lead">{copy.runsLead}</p>
        </div>
      </div>

      {loading && <div className="loading-panel">{copy.loading}</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !hasAnyPlan ? (
        <section className="outlook-panel">
          <div className="empty-state">
            <strong>{copy.noActive}</strong>
            <p>{copy.noActiveHint}</p>
            <a className="orchestration-inbox-link" href="/steward/">
              {copy.openSteward}
            </a>
            <div className="orchestration-board-filters">{viewModeChips}</div>
          </div>
        </section>
      ) : null}

      {!loading && hasAnyPlan ? (
        <div className="orchestration-board-layout">
          <aside className="orchestration-plan-sidebar" aria-label={copy.activePlans}>
            <h2 className="section-title">{copy.activePlans}</h2>
            <button
              type="button"
              className={
                selectedPlanId === null
                  ? "orchestration-plan-item is-active"
                  : "orchestration-plan-item"
              }
              onClick={() => {
                setSelectedPlanId(null);
                setSelectedCardId(null);
              }}
            >
              <span className="orchestration-plan-title">{copy.allPlans}</span>
            </button>
            {activePlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={
                  selectedPlanId === plan.id
                    ? "orchestration-plan-item is-active"
                    : "orchestration-plan-item"
                }
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setSelectedCardId(null);
                }}
              >
                <span className="orchestration-plan-title">{plan.title}</span>
                <span className="orchestration-plan-meta muted">
                  {copy.planProgress(plan.counts.done, plan.counts.total)}
                  {plan.counts.attention > 0
                    ? ` · ${copy.planAttention(plan.counts.attention)}`
                    : ""}
                </span>
              </button>
            ))}
            {completedPlans.length > 0 ? (
              <div className="orchestration-completed-plans">
                <button
                  type="button"
                  className="orchestration-completed-toggle"
                  onClick={() => setShowCompletedPlans((v) => !v)}
                >
                  {copy.completedPlans} ({completedPlans.length})
                </button>
                {showCompletedPlans
                  ? completedPlans.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className={
                          selectedPlanId === plan.id
                            ? "orchestration-plan-item is-active"
                            : "orchestration-plan-item"
                        }
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setSelectedCardId(null);
                          setViewMode("completed");
                        }}
                      >
                        <span className="orchestration-plan-title">{plan.title}</span>
                        <span className="orchestration-plan-meta muted">
                          {copy.planProgress(plan.counts.done, plan.counts.total)}
                        </span>
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </aside>

          <div className="orchestration-board-main">
            <div className="orchestration-board-toolbar">
              <div className="orchestration-board-filters">
                {viewModeChips}
                <span className="orchestration-toolbar-divider" aria-hidden="true" />
                <label className="orchestration-filter-select">
                  <span className="muted">{copy.groupLabel}</span>
                  <select
                    value={groupMode}
                    onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                  >
                    <option value="plan">{copy.groupByPlan}</option>
                    <option value="agent">{copy.groupByAgent}</option>
                    <option value="work_kind">{copy.groupByWorkKind}</option>
                    <option value="due">{copy.groupByDue}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={
                    filterMode === "all"
                      ? "orchestration-filter-chip is-active"
                      : "orchestration-filter-chip"
                  }
                  onClick={() => setFilterMode("all")}
                >
                  {copy.filterAll}
                </button>
                <button
                  type="button"
                  className={
                    filterMode === "attention"
                      ? "orchestration-filter-chip is-active"
                      : "orchestration-filter-chip"
                  }
                  onClick={() => setFilterMode("attention")}
                >
                  {copy.filterAttention}
                </button>
                <label className="orchestration-filter-select">
                  <span className="muted">{copy.filterAgent}</span>
                  <select
                    value={filterAgent}
                    onChange={(e) => setFilterAgent(e.target.value)}
                  >
                    <option value="">{copy.filterAll}</option>
                    {agentOptions.map((agent) => (
                      <option key={agent} value={agent}>
                        {agent}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="orchestration-filter-select">
                  <span className="muted">{copy.filterWorkKind}</span>
                  <select
                    value={filterWorkKind}
                    onChange={(e) => setFilterWorkKind(e.target.value)}
                  >
                    <option value="">{copy.filterAll}</option>
                    {workKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {workKindLabel(kind, copy.workKindUnknown)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className={hideEmpty ? "orchestration-filter-chip is-active" : "orchestration-filter-chip"}
                onClick={() => setHideEmpty((v) => !v)}
              >
                {copy.hideEmpty}
              </button>
            </div>

            {!hasVisibleCards ? (
              <div className="empty-state">
                <strong>{copy.noActive}</strong>
                <p>{copy.noActiveHint}</p>
              </div>
            ) : useSwimlanes ? (
              <div className="orchestration-swimlanes">
                {boardGroups
                  .filter((g) => g.cards.length > 0 || !hideEmpty)
                  .map((group) => (
                    <section key={group.key} className="orchestration-swimlane">
                      <header className="orchestration-swimlane-head">
                        <h3>{group.label}</h3>
                        <span className="muted">{group.cards.length}</span>
                      </header>
                      {renderKanban(group.cards)}
                    </section>
                  ))}
              </div>
            ) : (
              <>
                {boardGroups.length > 1 && groupMode !== "plan" ? (
                  boardGroups
                    .filter((g) => g.cards.length > 0 || !hideEmpty)
                    .map((group) => (
                      <section key={group.key} className="orchestration-group-row">
                        <header className="orchestration-swimlane-head">
                          <h3>{group.label}</h3>
                          <span className="muted">{group.cards.length}</span>
                        </header>
                        {renderKanban(group.cards)}
                      </section>
                    ))
                ) : (
                  renderKanban(filteredCards)
                )}
              </>
            )}
          </div>

          {selectedCard && payload ? (
            <aside className="orchestration-detail-panel" aria-label={copy.cardDetail}>
              <div className="orchestration-detail-head">
                <h2 className="section-title">{selectedCard.title}</h2>
                <button
                  type="button"
                  className="orchestration-filter-chip"
                  onClick={() => setSelectedCardId(null)}
                >
                  {copy.closeDetail}
                </button>
              </div>
              <p className="page-desc muted">{payload.planTitle}</p>
              <div className="orchestration-actions">
                <button
                  type="button"
                  className="orchestration-action orchestration-action-primary"
                  disabled={busy !== null}
                  onClick={() => void toggleComplete(selectedCard)}
                >
                  {busy === "complete"
                    ? copy.completeBusy
                    : busy === "reopen"
                      ? copy.reopenBusy
                      : selectedCard.closed
                        ? copy.reopenTask
                        : copy.completeTask}
                </button>
              </div>
              <dl className="orchestration-detail-meta">
                <div>
                  <dt>{copy.colStatus}</dt>
                  <dd className={`orchestration-status ${statusTone(selectedCard.status)}`}>
                    {statusLabel[selectedCard.status] ?? selectedCard.status}
                  </dd>
                </div>
                <div>
                  <dt>{copy.workKind}</dt>
                  <dd>
                    {workKindLabel(selectedCard.work_kind, copy.workKindUnknown)}
                  </dd>
                </div>
                <div>
                  <dt>{copy.filterAgent}</dt>
                  <dd>{selectedCard.agent}</dd>
                </div>
                {selectedCard.assignee ? (
                  <div>
                    <dt>{copy.assignee}</dt>
                    <dd>{selectedCard.assignee}</dd>
                  </div>
                ) : null}
                {selectedCard.due_date ? (
                  <div>
                    <dt>{copy.dueDate}</dt>
                    <dd>{selectedCard.due_date}</dd>
                  </div>
                ) : null}
                {selectedCard.blocked_on ? (
                  <div>
                    <dt>{copy.blockedOn}</dt>
                    <dd>{selectedCard.blocked_on}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="outlook-kpi summary-grid">
                <div>
                  <span className="kpi-value">{payload.nodeCount}</span>
                  <span className="kpi-label">{copy.nodes}</span>
                </div>
                <div>
                  <span className="kpi-value">{payload.waveCount}</span>
                  <span className="kpi-label">{copy.colWave}</span>
                </div>
                <div>
                  <span className="kpi-value">{payload.readyCount}</span>
                  <span className="kpi-label">{copy.kpiReady}</span>
                </div>
                <div>
                  <span className="kpi-value">{payload.blockedByFailureCount}</span>
                  <span className="kpi-label">{copy.kpiBlocked}</span>
                </div>
              </div>

              <div className="orchestration-actions">
                {payload.retryableCount > 0 ? (
                  <button
                    type="button"
                    className="orchestration-action"
                    disabled={busy !== null}
                    onClick={() => void act("retry")}
                  >
                    {busy === "retry" ? copy.retryBusy : copy.retryFailed}
                  </button>
                ) : null}
                {payload.cancellableCount > 0 ? (
                  <button
                    type="button"
                    className="orchestration-action"
                    disabled={busy !== null}
                    onClick={() => void act("cancel")}
                  >
                    {busy === "cancel" ? copy.cancelBusy : copy.cancelPending}
                  </button>
                ) : null}
                <a className="orchestration-inbox-link" href="/steward/">
                  {copy.openSteward}
                </a>
              </div>

              <section>
                <h3 className="section-title">依存 DAG</h3>
                <div className="orchestration-dag">
                  {Array.from({ length: payload.waveCount }, (_, i) => i + 1).map(
                    (wave) => (
                      <div key={wave} className="orchestration-dag-wave">
                        <p className="orchestration-dag-wave-label">wave {wave}</p>
                        {payload.nodes
                          .filter((node) => node.wave === wave)
                          .map((node) => (
                            <div
                              key={node.id}
                              className={`orchestration-dag-node orchestration-status ${statusTone(node.status)}`}
                            >
                              <strong>{node.title}</strong>
                              <span className="muted">{node.id}</span>
                              {node.depends_on_labels.length > 0 ? (
                                <span className="muted">
                                  ←{" "}
                                  {node.depends_on_labels
                                    .map((d) => d.title)
                                    .join(", ")}
                                </span>
                              ) : null}
                            </div>
                          ))}
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section>
                <h3 className="section-title">{copy.nodes}</h3>
                <div className="category-table">
                  <div className="category-table-head orchestration-table-head">
                    <span>{copy.colStatus}</span>
                    <span>{copy.cardDetail}</span>
                    <span>{copy.filterAgent}</span>
                    <span>{copy.colWave}</span>
                  </div>
                  {payload.nodes.map((node) => (
                    <div
                      key={node.id}
                      className={
                        node.id === selectedCard.id
                          ? "category-table-row orchestration-table-row is-selected"
                          : "category-table-row orchestration-table-row"
                      }
                    >
                      <span className={`orchestration-status ${statusTone(node.status)}`}>
                        {statusLabel[node.status] ?? node.status}
                      </span>
                      <span>{node.title}</span>
                      <span>{node.agent}</span>
                      <span>{node.wave}</span>
                    </div>
                  ))}
                </div>
              </section>

              {payload.blocked_downstream.length > 0 ? (
                <section>
                  <h3 className="section-title">{copy.blockedDownstream}</h3>
                  <ul className="orchestration-blocked-list">
                    {payload.blocked_downstream.map((row) => (
                      <li key={row.id}>
                        {row.id} · {row.agent} · {row.status}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
