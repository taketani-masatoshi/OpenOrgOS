import { useCallback, useEffect, useState } from "react";
import {
  fetchOrchestrationRun,
  fetchOrchestrationRuns,
  type OrchestrationRunPayload,
} from "./api";
import "./orchestration-runs.css";

const STATUS_LABEL: Record<string, string> = {
  pending: "待機",
  waiting: "依存待ち",
  dispatched: "送出",
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  blocked: "停止",
};

/** Text over emoji: status must stay legible where emoji fonts are unavailable. */
function statusTone(status: string): string {
  if (status === "completed") return "is-done";
  if (status === "failed" || status === "blocked") return "is-alert";
  if (status === "running" || status === "dispatched") return "is-active";
  return "is-idle";
}

export function OrchestrationRunsPage() {
  const [roots, setRoots] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payload, setPayload] = useState<OrchestrationRunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(true);

  const loadRoots = useCallback(async () => {
    const list = await fetchOrchestrationRuns();
    setRoots(list.active_roots);
    setSelectedId((prev) => prev ?? list.active_roots[0] ?? null);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const data = await fetchOrchestrationRun(id);
    setPayload(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadRoots();
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
  }, [loadRoots]);

  useEffect(() => {
    if (!selectedId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    let pollTimer = 0;

    const refresh = async () => {
      try {
        await loadDetail(selectedId);
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    void refresh();

    const source = new EventSource(
      `/chat/v1/orchestration/runs/stream?id=${encodeURIComponent(selectedId)}`,
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
          setStreaming(true);
        }
      } catch {
        /* ignore malformed SSE frame */
      }
    };
    // EventSource reports failures via onerror, never by throwing — without this the
    // board would silently freeze on the first fetch when the stream is unavailable.
    source.onerror = () => {
      if (cancelled || pollTimer !== 0) return;
      source.close();
      setStreaming(false);
      pollTimer = window.setInterval(() => void refresh(), 5000);
    };

    return () => {
      cancelled = true;
      source.close();
      if (pollTimer !== 0) window.clearInterval(pollTimer);
    };
  }, [selectedId, loadDetail]);

  return (
    <main className="workspace orchestration-runs">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">Run Board</h1>
          <p className="ops-page-lead">
            Work Order DAG · AIA 実行状況（{streaming ? "5 秒 SSE 更新" : "5 秒ポーリング更新"}）
          </p>
        </div>
      </div>

      {loading && <div className="loading-panel">読み込み中…</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="outlook-panel">
        <h2 className="section-title">アクティブ plan</h2>
        {roots.length === 0 ? (
          <p className="empty-panel">進行中の orchestration plan がありません。</p>
        ) : (
          <div className="orchestration-root-list">
            {roots.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  selectedId === id
                    ? "orchestration-root-chip is-active"
                    : "orchestration-root-chip"
                }
                onClick={() => setSelectedId(id)}
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </section>

      {payload && (
        <>
          <section className="outlook-panel">
            <h2 className="section-title">サマリー · {payload.rootId}</h2>
            <div className="outlook-kpi summary-grid">
              <div>
                <span className="kpi-value">{payload.nodeCount}</span>
                <span className="kpi-label">ノード</span>
              </div>
              <div>
                <span className="kpi-value">{payload.waveCount}</span>
                <span className="kpi-label">Wave</span>
              </div>
              <div>
                <span className="kpi-value">{payload.readyCount}</span>
                <span className="kpi-label">Ready</span>
              </div>
              <div>
                <span className="kpi-value">{payload.blockedByFailureCount}</span>
                <span className="kpi-label">Blocked</span>
              </div>
            </div>
            <p className="page-desc muted">
              AIA {payload.aia.tier} · running {payload.aia.running} / max{" "}
              {payload.aia.max_concurrent} · queued {payload.aia.queued}
            </p>
          </section>

          <section className="outlook-panel">
            <h2 className="section-title">ノード</h2>
            <div className="category-table">
              <div className="category-table-head orchestration-table-head">
                <span>状態</span>
                <span>ID</span>
                <span>Agent</span>
                <span>Wave</span>
                <span>AIA</span>
              </div>
              {payload.nodes.map((node) => (
                <div key={node.id} className="category-table-row orchestration-table-row">
                  <span className={`orchestration-status ${statusTone(node.status)}`}>
                    {STATUS_LABEL[node.status] ?? node.status}
                  </span>
                  <span>{node.id}</span>
                  <span>{node.agent}</span>
                  <span>{node.wave}</span>
                  <span className="muted">{node.aia?.state ?? "—"}</span>
                </div>
              ))}
            </div>
          </section>

          {payload.blocked_downstream.length > 0 && (
            <section className="outlook-panel">
              <h2 className="section-title">下流 blocked</h2>
              <ul className="orchestration-blocked-list">
                {payload.blocked_downstream.map((row) => (
                  <li key={row.id}>
                    {row.id} · {row.agent} · {row.status}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
