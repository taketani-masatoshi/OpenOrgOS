import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { MarkdownBody } from "./MarkdownBody";
import { CommandActionCard } from "./CommandActionCard";
import { ApprovalsQueue } from "./ApprovalsQueue";
import {
  enableAgentChatNotifications,
  ensureAgentChatHistory,
  getAgentChatState,
  sendAgentChatDraft,
  setAgentChatDraft,
  subscribeAgentChat,
  type AgentChatRole,
  type AgentChatTurn,
} from "./agentChatStore";

export type { AgentChatRole };

type Props = {
  agentId: AgentChatRole;
  title: string;
};

/**
 * Role-scoped Operator chat (秘書 / Executive Steward).
 * Conversation + draft live in agentChatStore so switching pages (or sending
 * concurrent requests on both agents) does not wipe 依頼内容.
 */
export function AgentChatPage({ agentId, title }: Props) {
  const state = useSyncExternalStore(
    subscribeAgentChat,
    () => getAgentChatState(agentId),
    () => getAgentChatState(agentId),
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputId = `agent-chat-input-${agentId}`;

  useEffect(() => {
    void ensureAgentChatHistory(agentId);
  }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.turns, state.busy]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendAgentChatDraft(agentId, title);
  }

  /** ⌘/Ctrl+Enter sends; plain Enter keeps newline in the textarea. */
  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    void sendAgentChatDraft(agentId, title);
  }

  return (
    <div className="agent-chat">
      <ApprovalsQueue />
      <form className="agent-chat-composer" onSubmit={(e) => void onSubmit(e)}>
        <label className="agent-chat-label-sr" htmlFor={inputId}>
          メッセージ
        </label>
        <div className="agent-chat-input-wrap">
          <textarea
            id={inputId}
            className="agent-chat-input"
            rows={3}
            value={state.draft}
            onChange={(e) => setAgentChatDraft(agentId, e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="⌘/Ctrl+Enter で送信"
            disabled={state.busy || state.loadingHistory}
            aria-keyshortcuts="Meta+Enter Control+Enter"
          />
        </div>
        <div className="agent-chat-actions">
          <button
            type="submit"
            className="agent-chat-send"
            disabled={
              state.busy || state.loadingHistory || !state.draft.trim()
            }
          >
            送信
          </button>
          {state.notifyPerm === "default" && (
            <button
              type="button"
              className="agent-chat-text-btn"
              onClick={() => void enableAgentChatNotifications(agentId)}
            >
              完了通知を許可
            </button>
          )}
        </div>
      </form>

      {state.error && (
        <p className="agent-chat-error" role="alert">
          {state.error}
        </p>
      )}

      <section className="agent-chat-history" aria-label={`${title}の会話`}>
        <div className="agent-chat-thread" role="log" aria-live="polite">
          {state.loadingHistory && (
            <p className="agent-chat-hint">読み込み中…</p>
          )}
          {!state.loadingHistory && state.turns.length === 0 && (
            <div className="agent-chat-empty">
              <p>まだ会話がありません。</p>
              <p className="agent-chat-hint">
                上の入力欄から送信すると、ここに履歴が残ります。
              </p>
            </div>
          )}
          {state.turns.map((t: AgentChatTurn) => (
            <div
              key={t.id}
              className={
                t.role === "user"
                  ? "agent-chat-bubble user"
                  : t.error
                    ? "agent-chat-bubble assistant error"
                    : "agent-chat-bubble assistant"
              }
            >
              {t.role === "user" ? (
                <div className="agent-chat-content is-plain">{t.content}</div>
              ) : (
                <>
                  <MarkdownBody className="agent-chat-content">
                    {t.content}
                  </MarkdownBody>
                  {t.structured?.command_plan &&
                    t.structured.command_plan.status !== "not_found" && (
                      <CommandActionCard plan={t.structured.command_plan} />
                    )}
                </>
              )}
            </div>
          ))}
          {state.busy && (
            <div className="agent-chat-busy" role="status">
              <span className="agent-chat-busy-pulse" aria-hidden />
              応答を生成中…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </section>

      <p className="agent-chat-cloud-link agent-chat-page-footer">
        LLM ワーカーは
        <a href="/llm-workers/">こちら</a>
        {" · "}
        有料のクラウドサービスの切り替えは
        <a href="/cloud-llm/">こちら</a>
        {" · "}
        履歴の保持件数は
        <a href="/chat-settings/">設定</a>
      </p>
    </div>
  );
}
