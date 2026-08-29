import { applyAnswerFeedback } from "./answer-memory.js";
import { buildFaqIndex } from "./faq-index.js";
import { touchChatActivityForFaq } from "./faq-idle.js";
import {
  type ChatFeedbackRating,
  setMessageFeedback,
} from "./chat-thread.js";

export function recordChatFeedback(opts: {
  threadId: string;
  tenant: string;
  turnId: string;
  rating: ChatFeedbackRating;
  agentId?: string;
}): { ok: true; rating: ChatFeedbackRating } | { ok: false; error: string } {
  const updated = setMessageFeedback(opts.threadId, opts.tenant, opts.turnId, opts.rating);
  if (!updated) {
    return { ok: false, error: "turn_not_found" };
  }
  applyAnswerFeedback({
    query: updated.userQuery,
    answer: updated.assistant.content,
    agentId: opts.agentId,
    rating: opts.rating,
  });
  if (opts.rating === "good") {
    buildFaqIndex();
  } else {
    touchChatActivityForFaq();
  }
  return { ok: true, rating: opts.rating };
}
