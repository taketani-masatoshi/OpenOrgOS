import { useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { rateAgentChatTurn, type AgentChatRole } from "./agentChatStore";

type Props = {
  agentId: AgentChatRole;
  turnId?: string;
  feedback?: "good" | "bad";
  disabled?: boolean;
};

export function ChatFeedbackButtons({ agentId, turnId, feedback, disabled }: Props) {
  const copy = useCopy(STEWARD_COPY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!turnId || disabled) return null;

  async function onRate(rating: "good" | "bad") {
    if (busy || feedback === rating) return;
    setBusy(true);
    setError(null);
    try {
      await rateAgentChatTurn(agentId, turnId!, rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-chat-feedback" role="group" aria-label={copy.feedbackLabel}>
      <button
        type="button"
        className={`agent-chat-feedback-btn${feedback === "good" ? " is-active" : ""}`}
        disabled={busy}
        aria-pressed={feedback === "good"}
        onClick={() => void onRate("good")}
      >
        {copy.feedbackGood}
      </button>
      <button
        type="button"
        className={`agent-chat-feedback-btn${feedback === "bad" ? " is-active" : ""}`}
        disabled={busy}
        aria-pressed={feedback === "bad"}
        onClick={() => void onRate("bad")}
      >
        {copy.feedbackBad}
      </button>
      {feedback && !error && (
        <span className="agent-chat-feedback-note">{copy.feedbackThanks}</span>
      )}
      {error && (
        <span className="agent-chat-feedback-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
