import { useEffect, useState, type FormEvent } from "react";
import {
  fetchChatSettings,
  updateChatSettings,
  type ChatHistoryMaxTurns,
} from "./api";

const OPTIONS: ChatHistoryMaxTurns[] = [5, 10, 20];

/**
 * Persist how many chat turns (user+assistant pairs) to keep on disk.
 */
export function ChatSettingsPage() {
  const [maxTurns, setMaxTurns] = useState<ChatHistoryMaxTurns>(10);
  const [draft, setDraft] = useState<ChatHistoryMaxTurns>(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

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
          ? `保存しました（${result.pruned_threads} 件の履歴を上限に合わせて整理）`
          : "保存しました"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-settings-page">
      <header className="chat-settings-header">
        <h1 className="chat-settings-title">チャット履歴の設定</h1>
        <p className="chat-settings-lead">
          秘書・スチュワードの会話は端末内に保存されます。保持する往復数を選び、それより古いものは自動で削除されます。
        </p>
      </header>

      {loading ? (
        <p className="chat-settings-muted">読み込み中…</p>
      ) : (
        <form className="chat-settings-form" onSubmit={(e) => void onSubmit(e)}>
          <fieldset className="chat-settings-fieldset">
            <legend>保持する往復数</legend>
            <div className="chat-settings-options" role="radiogroup" aria-label="保持する往復数">
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
                  <span>{n} 往復</span>
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
            className="agent-chat-send"
            disabled={busy || draft === maxTurns}
          >
            保存
          </button>
        </form>
      )}

      <p className="chat-settings-back">
        <a href="/steward/">スチュワードに戻る</a>
        {" · "}
        <a href="/secretary/">秘書に戻る</a>
      </p>
    </div>
  );
}
