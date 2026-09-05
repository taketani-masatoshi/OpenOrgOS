import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  ackAgentInbox,
  fetchAgentInbox,
  fetchAgentSummary,
  type AgentInboxItem,
  type AgentInboxSnapshot,
} from "./api";
import { STEWARD_COPY } from "./steward-copy";

/**
 * CEO view of delegated Work Order results — 「委譲と回答」.
 * Progress stays on /runs/; this page is answers + pending orders.
 */
export function HandoffsInboxPage() {
  const copy = useCopy(STEWARD_COPY);
  const [snap, setSnap] = useState<AgentInboxSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchAgentInbox("executive_steward");
      setSnap(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAck(item: AgentInboxItem) {
    setBusyId(item.mission_id);
    setError(null);
    try {
      await ackAgentInbox(item.mission_id, "acknowledged");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onOpenSummary(item: AgentInboxItem) {
    if (!item.summary_path) return;
    setBusyId(item.mission_id);
    setError(null);
    try {
      const body = await fetchAgentSummary(item.summary_path);
      setExpanded((prev) => ({ ...prev, [item.mission_id]: body.markdown }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="workspace">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{copy.handoffsTitle}</h1>
          <p className="ops-page-lead">{copy.handoffsLead}</p>
        </div>
        <div className="section-actions">
          <a className="btn btn-ghost btn-sm" href="/runs/">
            {copy.runs}
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            {copy.handoffsRefresh}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="agent-inbox-panel" aria-labelledby="handoffs-answers">
        <div className="agent-inbox-panel-bar">
          <h2 id="handoffs-answers" className="agent-inbox-panel-title">
            {copy.handoffsAnswers}
            {snap && snap.unread_count > 0 ? (
              <span className="agent-inbox-count">{snap.unread_count}</span>
            ) : null}
          </h2>
        </div>
        {!snap ? (
          <p className="agent-inbox-empty muted">{copy.loading}</p>
        ) : snap.items.length === 0 ? (
          <p className="agent-inbox-empty muted">{copy.handoffsAnswersEmpty}</p>
        ) : (
          <ul className="agent-inbox-list">
            {snap.items.map((item) => (
              <li
                key={item.mission_id}
                className={item.unread ? "agent-inbox-row unread" : "agent-inbox-row"}
              >
                <div className="agent-inbox-row-title">
                  <span className="agent-inbox-agent">{item.agent_label}</span>
                  <span className="agent-inbox-subject">{item.subject}</span>
                  {item.unread ? (
                    <span className="agent-inbox-badge">{copy.handoffsUnread}</span>
                  ) : null}
                </div>
                <div className="agent-inbox-row-meta muted">
                  {item.work_order_id ? (
                    <a href={`/runs/?id=${encodeURIComponent(item.work_order_id)}`}>
                      {item.work_order_id}
                    </a>
                  ) : null}
                  {item.submitted_at ? ` · ${item.submitted_at}` : null}
                </div>
                {item.summary ? (
                  <p className="agent-inbox-preview">{item.summary}</p>
                ) : null}
                {expanded[item.mission_id] ? (
                  <pre className="agent-inbox-body">{expanded[item.mission_id]}</pre>
                ) : null}
                <div className="agent-inbox-row-actions">
                  {item.summary_path ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === item.mission_id}
                      onClick={() => void onOpenSummary(item)}
                    >
                      {copy.handoffsOpenSummary}
                    </button>
                  ) : null}
                  {item.unread ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === item.mission_id}
                      onClick={() => void onAck(item)}
                    >
                      {copy.handoffsAck}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="agent-inbox-panel" aria-labelledby="handoffs-pending">
        <div className="agent-inbox-panel-bar">
          <h2 id="handoffs-pending" className="agent-inbox-panel-title">
            {copy.handoffsPending}
          </h2>
        </div>
        {!snap ? (
          <p className="agent-inbox-empty muted">{copy.loading}</p>
        ) : snap.pending_orders.length === 0 ? (
          <p className="agent-inbox-empty muted">{copy.handoffsPendingEmpty}</p>
        ) : (
          <ul className="agent-inbox-list">
            {snap.pending_orders.map((item) => (
              <li key={item.mission_id} className="agent-inbox-row">
                <div className="agent-inbox-row-title">
                  <span className="agent-inbox-agent">{item.agent_label}</span>
                  <span className="agent-inbox-subject">{item.subject}</span>
                </div>
                <div className="agent-inbox-row-meta muted">
                  {item.work_order_id ? (
                    <a href={`/runs/?id=${encodeURIComponent(item.work_order_id)}`}>
                      {item.work_order_id}
                      {item.work_order_status ? ` (${item.work_order_status})` : ""}
                    </a>
                  ) : (
                    copy.handoffsAwaiting
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
