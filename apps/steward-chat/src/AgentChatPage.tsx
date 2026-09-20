import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { LlmRoutePicker } from "./LlmRoutePicker";
import { MarkdownBody } from "./MarkdownBody";
import { CommandActionCard } from "./CommandActionCard";
import { TowerActionCard } from "./TowerActionCard";
import { LedgerProposeCard } from "./LedgerProposeCard";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { buildChatFaqIndex } from "./api";
import {
  enableAgentChatNotifications,
  ensureAgentChatHistory,
  getAgentChatState,
  sendAgentChatDraft,
  setAgentChatDraft,
  subscribeAgentChat,
  MAX_AGENT_CHAT_IN_FLIGHT,
  type AgentChatRole,
  type AgentChatTurn,
} from "./agentChatStore";
import { ChatFeedbackButtons } from "./ChatFeedbackButtons";

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
  const copy = useCopy(STEWARD_COPY);
  const state = useSyncExternalStore(
    subscribeAgentChat,
    () => getAgentChatState(agentId),
    () => getAgentChatState(agentId),
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputId = `agent-chat-input-${agentId}`;
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqNote, setFaqNote] = useState<string | null>(null);
  const [webSearch, setWebSearch] = useState(false);

  useEffect(() => {
    void ensureAgentChatHistory(agentId);
  }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.turns, state.busy]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendAgentChatDraft(agentId, title, {
      webSearch,
    });
  }

  /** ⌘/Ctrl+Enter sends; plain Enter keeps newline in the textarea. */
  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    void sendAgentChatDraft(agentId, title, {
      webSearch,
    });
  }

  async function onRebuildFaq() {
    if (faqBusy) return;
    setFaqBusy(true);
    setFaqNote(null);
    try {
      const result = await buildChatFaqIndex();
      setFaqNote(copy.faqBuilt(result.entries));
    } catch (err) {
      setFaqNote(err instanceof Error ? err.message : String(err));
    } finally {
      setFaqBusy(false);
    }
  }

  return (
    <div className="agent-chat">
      {/* Nav tab already names the agent; keep the heading for assistive tech only. */}
      <h1 className="agent-chat-title agent-chat-label-sr">{title}</h1>
      <LedgerProposeCard />
      <form className="agent-chat-composer" onSubmit={(e) => void onSubmit(e)}>
        <label className="agent-chat-label-sr" htmlFor={inputId}>
          {copy.message}
        </label>
        <div className="agent-chat-input-wrap">
          <textarea
            id={inputId}
            className="agent-chat-input"
            rows={3}
            value={state.draft}
            onChange={(e) => setAgentChatDraft(agentId, e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={copy.sendPlaceholder}
            disabled={
              state.loadingHistory ||
              state.inFlight >= MAX_AGENT_CHAT_IN_FLIGHT
            }
            aria-keyshortcuts="Meta+Enter Control+Enter"
          />
          <div className="agent-chat-composer-bar">
            <div className="agent-chat-route-controls">
              <LlmRoutePicker
                agentId={agentId}
                compact
                forcedLocal={webSearch}
              />
              <label
                className={
                  webSearch
                    ? "agent-chat-web-search-toggle is-on"
                    : "agent-chat-web-search-toggle"
                }
              >
                <input
                  type="checkbox"
                  role="switch"
                  checked={webSearch}
                  onChange={(e) => setWebSearch(e.target.checked)}
                />
                <span>Web検索</span>
                <strong>{webSearch ? "ON" : "OFF"}</strong>
              </label>
              {webSearch && (
                <small className="agent-chat-web-search-notice">
                  入力内容を公開Web検索へ送信します
                </small>
              )}
            </div>
            <div className="agent-chat-actions">
              {state.notifyPerm === "default" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void enableAgentChatNotifications(agentId)}
                >
                  {copy.notify}
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={
                  state.loadingHistory ||
                  state.inFlight >= MAX_AGENT_CHAT_IN_FLIGHT ||
                  !state.draft.trim()
                }
              >
                {copy.send}
              </button>
            </div>
          </div>
        </div>
      </form>

      {state.error && (
        <p className="agent-chat-error" role="alert">
          {state.error}
        </p>
      )}

      <section className="agent-chat-history" aria-label={copy.conversation(title)}>
        <div className="agent-chat-thread" role="log" aria-live="polite">
          {state.loadingHistory && (
            <p className="agent-chat-hint">{copy.loading}</p>
          )}
          {!state.loadingHistory && state.turns.length === 0 && (
            <div className="agent-chat-empty">
              <p>{copy.emptyChat}</p>
              <p className="agent-chat-hint">{copy.emptyChatHint}</p>
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
                  {t.faqServed && (
                    <p className="agent-chat-faq-badge">{copy.faqServedBadge}</p>
                  )}
                  <ChatFeedbackButtons
                    agentId={agentId}
                    turnId={t.turnId}
                    feedback={t.feedback}
                    disabled={t.error || t.pending}
                  />
                  {t.structured?.command_plan &&
                    t.structured.command_plan.status !== "not_found" && (
                      <CommandActionCard plan={t.structured.command_plan} />
                    )}
                  {t.structured?.tower_plan &&
                    typeof t.structured.tower_plan === "object" &&
                    "plan_id" in t.structured.tower_plan && (
                      <TowerActionCard
                        plan={
                          t.structured.tower_plan as {
                            plan_id: string;
                            message: string;
                            status: string;
                            reply_preview?: string;
                            assignment?: {
                              work_kind?: string;
                              assignee_employee_id?: string;
                              due_date?: string;
                              to_agent?: string;
                              needs_ceo_pick?: boolean;
                              candidate_employee_ids?: string[];
                              judgment_only?: boolean;
                            };
                            work_order_ids?: string[];
                          }
                        }
                      />
                    )}
                </>
              )}
            </div>
          ))}
          {state.inFlight > 0 && (
            <div className="agent-chat-busy" role="status">
              <span className="agent-chat-busy-pulse" aria-hidden />
              {state.inFlight === 1
                ? copy.generating
                : copy.generatingCount(state.inFlight)}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </section>

      <p className="agent-chat-cloud-link agent-chat-page-footer">
        {copy.workersLinkBefore}
        <a href="/llm-workers/">{copy.workersLink}</a>
        {" · "}
        {copy.cloudLinkBefore}
        <a href="/cloud-llm/">{copy.cloudLink}</a>
        {" · "}
        {copy.historyLinkBefore}
        <a href="/chat-settings/">{copy.historyLink}</a>
        {" · "}
        <button
          type="button"
          className="agent-chat-text-btn"
          disabled={faqBusy}
          onClick={() => void onRebuildFaq()}
        >
          {faqBusy ? copy.faqBuilding : copy.faqBuild}
        </button>
      </p>
      {faqNote && (
        <p className="agent-chat-hint agent-chat-page-footer" role="status">
          {faqNote}
        </p>
      )}
    </div>
  );
}
