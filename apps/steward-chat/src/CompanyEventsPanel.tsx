import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { chatApi } from "./api";

type OpenEvent = {
  id: string;
  kind: string;
  title: string;
  status: string;
  occurred_at: string;
};

const KINDS = [
  "governance",
  "registration",
  "contract",
  "finance",
  "compliance",
  "meeting",
  "personnel",
  "misc",
] as const;

export function CompanyEventsPanel() {
  const copy = useCopy(STEWARD_COPY);
  const [events, setEvents] = useState<OpenEvent[]>([]);
  const [month, setMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("misc");
  const [title, setTitle] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [chainNote, setChainNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await chatApi<{
        ok: boolean;
        month: string;
        events: OpenEvent[];
      }>(`/chat/v1/events/open${includeClosed ? "?include_voided=1" : ""}`);
      setEvents(res.events ?? []);
      setMonth(res.month);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [includeClosed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await chatApi("/chat/v1/events", {
        method: "POST",
        body: JSON.stringify({ kind, title: title.trim() }),
      });
      setTitle("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runLifecycle(
    eventId: string,
    action: "close" | "archive" | "void",
  ) {
    setBusy(true);
    setError(null);
    try {
      await chatApi(`/chat/v1/events/${encodeURIComponent(eventId)}/${action}`, {
        method: "POST",
        body: action === "void" ? JSON.stringify({ reason: voidReason.trim() }) : "{}",
      });
      if (action === "void") setVoidReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyChain() {
    setBusy(true);
    setError(null);
    try {
      const res = await chatApi<{
        report: { ok: boolean; chain_checked: number; issues: Array<{ message: string }> };
      }>("/chat/v1/events/chain/verify");
      setChainNote(
        res.report.ok
          ? `${copy.companyEventChainOk} (${res.report.chain_checked})`
          : `${copy.companyEventChainNg}: ${res.report.issues
              .map((i) => i.message)
              .join(" / ")}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="outlook-panel" aria-labelledby="exec-events">
      <h2 id="exec-events" className="section-title">
        {copy.companyEventsTitle}
        {month ? <span className="muted"> · {month}</span> : null}
      </h2>
      {error ? <div className="error-banner">{error}</div> : null}
      {events.length === 0 ? (
        <p className="page-desc muted">{copy.companyEventsEmpty}</p>
      ) : (
        <ul className="executive-work-list">
          {events.map((e) => (
            <li key={e.id}>
              <strong>
                {e.kind}: {e.title}
              </strong>
              <span className="muted">
                {e.status} · {e.occurred_at.slice(0, 10)}
              </span>
              <span className="approvals-queue-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || e.status === "closed" || e.status === "voided"}
                  onClick={() => void runLifecycle(e.id, "close")}
                >
                  {copy.companyEventClose}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || e.status === "voided"}
                  onClick={() => void runLifecycle(e.id, "archive")}
                >
                  {copy.companyEventArchive}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || !voidReason.trim() || e.status === "voided"}
                  onClick={() => void runLifecycle(e.id, "void")}
                >
                  {copy.companyEventVoid}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="approvals-ceo-fields executive-events-form">
        <label className="approvals-ceo-field">
          <span>{copy.companyEventKind}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.companyEventTitleField}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <div className="approvals-ceo-fields executive-events-form">
        <label className="approvals-ceo-field">
          <span>{copy.companyEventVoidReason}</span>
          <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </label>
        <label className="approvals-ceo-field">
          <span>{copy.companyEventIncludeClosed}</span>
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
          />
        </label>
      </div>
      <div className="approvals-queue-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !title.trim()}
          onClick={() => void onCreate()}
        >
          {copy.companyEventCreate}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void verifyChain()}
        >
          {copy.companyEventChainVerify}
        </button>
      </div>
      {chainNote ? <p className="muted">{chainNote}</p> : null}
    </section>
  );
}
