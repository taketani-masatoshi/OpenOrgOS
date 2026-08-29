import { useEffect, useState, type FormEvent } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import {
  fetchChatSettings,
  updateChatSettings,
  buildChatFaqIndex,
  type ChatHistoryMaxTurns,
} from "./api";

const OPTIONS: ChatHistoryMaxTurns[] = [5, 10, 20];

/**
 * Persist how many chat turns (user+assistant pairs) to keep on disk.
 */
export function ChatSettingsPage() {
  const copy = useCopy(STEWARD_COPY);
  const [maxTurns, setMaxTurns] = useState<ChatHistoryMaxTurns>(10);
  const [draft, setDraft] = useState<ChatHistoryMaxTurns>(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqNote, setFaqNote] = useState<string | null>(null);
  const [notifyHome, setNotifyHome] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("orgos.executiveHome.notify") === "1";
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchChatSettings();
        if (cancelled) return;
        setMaxTurns(settings.max_turns);
        setDraft(settings.max_turns);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || draft === maxTurns) return;
    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const result = await updateChatSettings(draft);
      setMaxTurns(result.max_turns);
      setDraft(result.max_turns);
      setSavedNote(
        result.pruned_threads > 0
          ? copy.savedPruned(result.pruned_threads)
          : copy.saved
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onBuildFaq() {
    if (faqBusy) return;
    setFaqBusy(true);
    setFaqNote(null);
    setError(null);
    try {
      const result = await buildChatFaqIndex();
      setFaqNote(copy.faqBuilt(result.entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFaqBusy(false);
    }
  }

  return (
    <div className="chat-settings-page">
      <header className="chat-settings-header">
        <h1 className="chat-settings-title">{copy.chatSettingsTitle}</h1>
        <p className="chat-settings-lead">{copy.chatSettingsLead}</p>
      </header>

      {loading ? (
        <p className="chat-settings-muted">{copy.loading}</p>
      ) : (
        <form className="chat-settings-form" onSubmit={(e) => void onSubmit(e)}>
          <fieldset className="chat-settings-fieldset">
            <legend>{copy.maxTurns}</legend>
            <div className="chat-settings-options" role="radiogroup" aria-label={copy.maxTurns}>
              {OPTIONS.map((n) => (
                <label key={n} className="chat-settings-option">
                  <input
                    type="radio"
                    name="max_turns"
                    value={n}
                    checked={draft === n}
                    onChange={() => setDraft(n)}
                    disabled={busy}
                  />
                  <span>{copy.turns(n)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="chat-settings-error" role="alert">
              {error}
            </p>
          )}
          {savedNote && (
            <p className="chat-settings-ok" role="status">
              {savedNote}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || draft === maxTurns}
          >
            {copy.save}
          </button>
        </form>
      )}

      {!loading && (
        <section className="chat-settings-faq">
          <h2 className="section-title">{copy.mailSection}</h2>
          <p className="chat-settings-muted">{copy.mailSettingsPointer}</p>
          <p>
            <a href="/?onboarding=1">{copy.companySettingsLink}</a>
          </p>
        </section>
      )}

      {!loading && (
        <section className="chat-settings-faq">
          <h2 className="section-title">{copy.executiveNotifyLabel}</h2>
          <label className="chat-settings-option">
            <input
              type="checkbox"
              checked={notifyHome}
              onChange={(e) => {
                const on = e.target.checked;
                setNotifyHome(on);
                localStorage.setItem(
                  "orgos.executiveHome.notify",
                  on ? "1" : "0",
                );
                if (on && "Notification" in window) {
                  void Notification.requestPermission();
                }
              }}
            />
            <span>{copy.executiveNotifyHint}</span>
          </label>
        </section>
      )}

      {!loading && (
        <section className="chat-settings-faq">
          <h2 className="section-title">{copy.faqSection}</h2>
          <p className="chat-settings-muted">{copy.faqBuildLead}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={faqBusy}
            onClick={() => void onBuildFaq()}
          >
            {faqBusy ? copy.faqBuilding : copy.faqBuild}
          </button>
          {faqNote && (
            <p className="chat-settings-ok" role="status">
              {faqNote}
            </p>
          )}
        </section>
      )}

      <p className="chat-settings-back">
        <a href="/steward/">{copy.backSteward}</a>
        {" · "}
        <a href="/secretary/">{copy.backSecretary}</a>
      </p>
    </div>
  );
}
