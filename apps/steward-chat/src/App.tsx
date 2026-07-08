import { useCallback, useEffect, useState } from "react";
import {
  approveWire,
  chatApi,
  fetchAuthConfig,
  fetchHealth,
  fetchMe,
  fetchOperatorStats,
  fetchToday,
  flushWirePending,
  loginDev,
  loginProd,
  registerWitness,
  verifyWitness,
  flushWitnessPending,
  sendMessageStream,
  type AuthConfig,
  type AuthUser,
  type OperatorStats,
  type OperatorStructured,
  type OperatorTelemetry,
  type TodayContext,
} from "./api";
import { loginWithWebAuthn } from "./webauthn-login";
import { registerWithWebAuthn } from "./webauthn-register";

interface ChatLine {
  role: "user" | "assistant";
  text: string;
  structured?: OperatorStructured;
  telemetry?: OperatorTelemetry;
}

function StructuredExtras({
  structured,
  telemetry,
}: {
  structured?: OperatorStructured;
  telemetry?: OperatorTelemetry;
}) {
  if (!structured && !telemetry) return null;
  return (
    <div className="msg-extras">
      {structured && structured.risks.length > 0 && (
        <ul className="risk-list">
          {structured.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {structured && structured.actions.length > 0 && (
        <ul className="action-list">
          {structured.actions.map((a, i) => (
            <li key={i}>
              <span className={`action-chip priority-${a.priority}`}>{a.priority.toUpperCase()}</span>
              {a.label}
              {a.ref_id && <span className="ref-id"> {a.ref_id}</span>}
            </li>
          ))}
        </ul>
      )}
      {telemetry && (
        <details className="msg-meta">
          <summary>
            {telemetry.latency_ms}ms · {telemetry.total_tokens} tok · tools {telemetry.tool_calls}
          </summary>
          <span>
            in {telemetry.prompt_tokens} / out {telemetry.completion_tokens}
            {telemetry.estimated_cost_usd != null && ` · ~$${telemetry.estimated_cost_usd}`}
          </span>
        </details>
      )}
    </div>
  );
}

function LoginGate({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [passkey, setPasskey] = useState("orgos-dev");
  const [idToken, setIdToken] = useState("");
  const [prodToken, setProdToken] = useState("");
  const [operatorId, setOperatorId] = useState("CEO");
  const [approverId, setApproverId] = useState("CEO");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webAuthnBusy, setWebAuthnBusy] = useState(false);

  useEffect(() => {
    void fetchAuthConfig()
      .then(setAuthConfig)
      .catch(() =>
        setAuthConfig({ ok: true, mode: "dev", dev_login_allowed: true })
      );
  }, []);

  async function onDevSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await loginDev({
        passkey,
        operator_id: operatorId,
        approver_id: approverId,
      });
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onProdSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        authConfig?.prod_adapter === "oidc"
          ? { id_token: idToken, operator_id: operatorId, approver_id: approverId }
          : {
              prod_token: prodToken,
              operator_id: operatorId,
              approver_id: approverId,
            };
      const user = await loginProd(body);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onWebAuthnLogin() {
    setWebAuthnBusy(true);
    setError(null);
    try {
      await loginWithWebAuthn(chatApi, { e2e: authConfig?.webauthn_e2e_login });
      const user = await fetchMe();
      if (user) onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWebAuthnBusy(false);
    }
  }

  async function onWebAuthnRegister() {
    setWebAuthnBusy(true);
    setError(null);
    try {
      await registerWithWebAuthn(chatApi, {
        operator_id: operatorId.trim(),
        approver_id: approverId.trim(),
      });
      await onWebAuthnLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWebAuthnBusy(false);
    }
  }

  const prodMode = authConfig?.mode === "prod";

  return (
    <div className="login">
      <h1>Steward Chat</h1>
      <p>CEO 向けオペレーター IF</p>

      <label className="field">
        Operator
        <input value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
      </label>
      <label className="field">
        Approver
        <input value={approverId} onChange={(e) => setApproverId(e.target.value)} />
      </label>

      {prodMode ? (
        <>
          {authConfig?.prod_adapter === "oidc" && (
            <form onSubmit={(e) => void onProdSubmit(e)}>
              <label className="field">
                OIDC id_token
                <input value={idToken} onChange={(e) => setIdToken(e.target.value)} />
              </label>
              <button type="submit" disabled={busy}>
                Sign in (OIDC)
              </button>
            </form>
          )}
          {authConfig?.prod_adapter === "legacy_token" && authConfig.legacy_token_allowed && (
            <form onSubmit={(e) => void onProdSubmit(e)}>
              <label className="field">
                prod_token
                <input value={prodToken} onChange={(e) => setProdToken(e.target.value)} />
              </label>
              <button type="submit" disabled={busy}>
                Sign in (legacy)
              </button>
            </form>
          )}
          {(authConfig?.prod_adapter === "webauthn" || authConfig?.webauthn) && (
            <div className="auth-actions">
              <button type="button" disabled={webAuthnBusy} onClick={() => void onWebAuthnLogin()}>
                Sign in (WebAuthn)
              </button>
              {authConfig.webauthn?.registration_allowed && (
                <button
                  type="button"
                  disabled={webAuthnBusy}
                  onClick={() => void onWebAuthnRegister()}
                >
                  Register passkey
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={(e) => void onDevSubmit(e)}>
          <label className="field">
            Dev passkey
            <input
              type="password"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <button type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [today, setToday] = useState<TodayContext | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [operatorStats, setOperatorStats] = useState<OperatorStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wireConsoleUrl, setWireConsoleUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetchMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void fetchHealth()
      .then((h) => {
        if (h.service === "operator-console") setWireConsoleUrl("/wire/");
      })
      .catch(() => setWireConsoleUrl(null));
  }, []);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const [ctx, stats] = await Promise.all([fetchToday(), fetchOperatorStats().catch(() => null)]);
      setToday(ctx);
      setOperatorStats(stats);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorized") {
        setUser(null);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTodayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadToday();
  }, [user, loadToday]);

  useEffect(() => {
    if (!user) return;
    const es = new EventSource("/chat/v1/events/stream", { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string };
        if (data.type === "pipeline_daily_complete") {
          setToast("Daily pipeline 完了 — Today を更新しました");
          window.setTimeout(() => setToast(null), 3000);
          void loadToday();
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [user, loadToday]);

  async function onApproveWire(approvalId: string) {
    setApprovingId(approvalId);
    setError(null);
    try {
      const result = await approveWire(approvalId, user?.approver_id);
      if (result.mode === "wire" && result.flushed !== undefined) {
        setError(null);
      }
      await loadToday();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingId(null);
    }
  }

  async function onFlushWire() {
    setError(null);
    try {
      const result = await flushWirePending();
      setToast(`Wire flush: ${result.flushed} 件`);
      window.setTimeout(() => setToast(null), 3000);
      await loadToday();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onWitnessRegister(eventId: string, side: "sent" | "received") {
    setError(null);
    try {
      await registerWitness(eventId, side);
      setToast(`Witness ${side} registered`);
      window.setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onWitnessVerify(eventId: string) {
    setError(null);
    try {
      const result = await verifyWitness(eventId);
      const quorum = (result.quorum as { satisfied?: boolean } | undefined)?.satisfied;
      if (quorum) {
        setToast("Witness quorum OK");
        window.setTimeout(() => setToast(null), 3000);
      } else {
        setError("Witness verify: quorum pending");
      }
      await loadToday();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    setLines((prev) => [
      ...prev,
      { role: "user", text: msg },
      { role: "assistant", text: "" },
    ]);
    setBusy(true);

    try {
      await sendMessageStream(msg, {
        onDelta: (content) => {
          setLines((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, text: last.text + content };
            }
            return next;
          });
        },
        onDone: (payload) => {
          setLines((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                text: last.text || payload.reply || "",
                structured: payload.structured,
                telemetry: payload.telemetry,
              };
            }
            return next;
          });
        },
        onError: (err) => {
          setLines((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", text: err };
            return next;
          });
        },
      });
    } catch (err) {
      setLines((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          text: err instanceof Error ? err.message : String(err),
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return <div className="login">Loading…</div>;
  }

  if (!user) {
    return <LoginGate onLoggedIn={setUser} />;
  }

  return (
    <div className="layout">
      {toast && <div className="toast">{toast}</div>}
      <aside className="today">
        <header>
          <h1>Today</h1>
          <div className="header-actions">
            {wireConsoleUrl && (
              <a className="wire-link" href={wireConsoleUrl}>
                Wire Console →
              </a>
            )}
            <button type="button" onClick={() => void loadToday()}>
              Refresh
            </button>
          </div>
        </header>
        <p className="meta user">{user.operator_id}</p>
        {error && <p className="error">{error}</p>}
        {todayLoading && !today && (
          <div className="skeleton">
            <div className="skeleton-block wide" />
            <div className="skeleton-block narrow" />
            <div className="skeleton-block wide" />
          </div>
        )}
        {today && (
          <>
            <p className="meta">
              {today.company_name} · {today.report_date}
            </p>
            {operatorStats && operatorStats.stats.count > 0 && (
              <section className="stats-panel">
                <h2>直近 Ask</h2>
                <div className="stats-row">
                  <span>P50 {operatorStats.stats.latency_p50_ms}ms</span>
                  <span>P95 {operatorStats.stats.latency_p95_ms}ms</span>
                </div>
                <div className="stats-row">
                  <span>{operatorStats.stats.total_tokens} tok</span>
                  {operatorStats.stats.estimated_cost_usd != null && (
                    <span>~${operatorStats.stats.estimated_cost_usd}</span>
                  )}
                </div>
                {operatorStats.recent.length > 0 && (
                  <ul className="stats-recent">
                    {operatorStats.recent.map((r) => (
                      <li key={r.at}>
                        {r.latency_ms}ms · {r.total_tokens} tok · {r.model}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {today.kpis.length > 0 && (
              <section>
                <h2>KPI</h2>
                <div className="kpi-grid">
                  {today.kpis.map((k) => (
                    <div key={k.label} className="kpi-card">
                      <span className="kpi-label">{k.label}</span>
                      <span className="kpi-value">{k.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2>今日の判断</h2>
              <ul>
                {today.decisions.length === 0 ? (
                  <li>P0 なし</li>
                ) : (
                  today.decisions.map((d) => (
                    <li key={d.id}>
                      <strong>{d.id}</strong> {d.title}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h2>承認待ち ({today.approvals.length})</h2>
              {today.approvals.length === 0 ? (
                <p className="empty-state">承認待ちはありません</p>
              ) : (
                <ul>
                  {today.approvals.map((a) => (
                    <li key={a.id}>
                      [{a.scope}] {a.subject}
                      {a.scope === "wire" && (
                        <button
                          type="button"
                          className="inline-btn"
                          disabled={approvingId === a.id}
                          onClick={() => void onApproveWire(a.id)}
                        >
                          承認
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {(today.wire_delivery_pending_count > 0 || today.wire_delivery.length > 0) && (
              <section>
                <h2>
                  配送待ち ({today.wire_delivery_pending_count || today.wire_delivery.length})
                  <button type="button" className="inline-btn" onClick={() => void onFlushWire()}>
                    Flush
                  </button>
                </h2>
                <ul className="wire-list">
                  {today.wire_delivery.map((d) => (
                    <li key={`${d.peer_id}:${d.event_id}`}>
                      <strong>{d.peer_id}</strong>
                      <span className="wire-meta">
                        {d.event_id.slice(0, 8)}… · attempts {d.attempts}
                      </span>
                      {d.last_error && <p className="wire-preview">{d.last_error}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {today.wire_pending.length > 0 && (
              <section>
                <h2>
                  Wire ({today.wire_pending.length})
                  <button type="button" className="inline-btn" onClick={() => void onFlushWire()}>
                    Flush
                  </button>
                </h2>
                <ul className="wire-list">
                  {today.wire_pending.map((w) => (
                    <li key={w.id}>
                      <strong>{w.subject}</strong>
                      <span className="wire-meta">
                        {w.counterparty} · {w.status_label}
                      </span>
                      {w.preview && <p className="wire-preview">{w.preview}</p>}
                      {w.can_approve && w.approval_id && (
                        <button
                          type="button"
                          className="inline-btn"
                          disabled={approvingId === w.approval_id}
                          onClick={() => void onApproveWire(w.approval_id!)}
                        >
                          {approvingId === w.approval_id ? "処理中…" : "承認"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {today.wire_pending.length === 0 &&
              today.wire_delivery_pending_count === 0 &&
              today.witness_pending.length === 0 && (
                <p className="empty-state">Wire / Witness 待ちはありません</p>
              )}
            {today.witness_pending.length > 0 && (
              <section>
                <h2>
                  Witness ({today.witness_pending_count})
                  <button
                    type="button"
                    className="inline-btn"
                    onClick={() =>
                      void flushWitnessPending().then((r) => {
                        setToast(`Witness flush: ${r.flushed} 件`);
                        window.setTimeout(() => setToast(null), 3000);
                        void loadToday();
                      })
                    }
                  >
                    Flush
                  </button>
                </h2>
                <ul className="wire-list">
                  {today.witness_pending.map((w) => (
                    <li key={w.id}>
                      <strong>{w.subject}</strong>
                      {w.preview && <p className="wire-preview">{w.preview}</p>}
                      {w.can_witness && w.event_id && (
                        <>
                          <button
                            type="button"
                            className="inline-btn"
                            onClick={() => void onWitnessRegister(w.event_id!, "sent")}
                          >
                            Register sent
                          </button>
                          <button
                            type="button"
                            className="inline-btn"
                            onClick={() => void onWitnessRegister(w.event_id!, "received")}
                          >
                            Register received
                          </button>
                          <button
                            type="button"
                            className="inline-btn"
                            onClick={() => void onWitnessVerify(w.event_id!)}
                          >
                            Verify
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="stats">
              <span>Wire: {today.wire_pending_count}</span>
              <span>Delivery: {today.wire_delivery_pending_count}</span>
              <span>Witness: {today.witness_pending_count}</span>
              <span>Inbox: {today.inbox_pending.length}</span>
              <span>Escalate: {today.escalate_pending_count}</span>
            </section>
          </>
        )}
      </aside>
      <main className="chat">
        <h2>Steward Chat</h2>
        <div className="messages">
          {lines.map((line, i) => (
            <div key={i} className={`msg ${line.role}`}>
              <div className="msg-body">
                {line.text || (busy && i === lines.length - 1 ? "…" : "")}
              </div>
              {line.role === "assistant" && (
                <StructuredExtras structured={line.structured} telemetry={line.telemetry} />
              )}
            </div>
          ))}
        </div>
        <form onSubmit={(e) => void onSend(e)}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="来週の支払いリスクは？"
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
