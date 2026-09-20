import { fetchChatThread, sendMessage, sendMessageStream, submitChatFeedback, type OperatorStructured } from "./api";
import { loadLlmRoute } from "./llmRoute";
import { formatNotificationPreview } from "./notificationPreview";

export type AgentChatRole = "secretary" | "executive_steward";

export type AgentChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at?: string;
  turnId?: string;
  feedback?: "good" | "bad";
  error?: boolean;
  /** Optimistic user turn not yet confirmed on disk. */
  pending?: boolean;
  structured?: OperatorStructured;
  faqServed?: boolean;
};

type AgentChatState = {
  draft: string;
  turns: AgentChatTurn[];
  busy: boolean;
  /** Independent 依頼 currently waiting for a reply. */
  inFlight: number;
  error: string | null;
  loadingHistory: boolean;
  historyLoaded: boolean;
  maxTurns: number;
  notifyPerm: NotificationPermission | "unsupported";
};

/** Per-agent cap so one chat cannot flood the local LLM. */
export const MAX_AGENT_CHAT_IN_FLIGHT = 4;

export type AgentChatSendOptions = {
  webSearch?: boolean;
};

const DRAFT_KEY = (agentId: AgentChatRole) => `orgos.agentChat.draft.${agentId}`;
const SESSION_KEY = (agentId: AgentChatRole) =>
  `orgos.agentChat.session.${agentId}`;

const listeners = new Set<() => void>();

const states: Record<AgentChatRole, AgentChatState> = {
  secretary: createInitialState("secretary"),
  executive_steward: createInitialState("executive_steward"),
};

function createInitialState(agentId: AgentChatRole): AgentChatState {
  let draft = "";
  let turns: AgentChatTurn[] = [];
  let busy = false;
  let inFlight = 0;
  let maxTurns = 10;
  try {
    draft = sessionStorage.getItem(DRAFT_KEY(agentId)) ?? "";
    const raw = sessionStorage.getItem(SESSION_KEY(agentId));
    if (raw) {
      const parsed = JSON.parse(raw) as {
        turns?: AgentChatTurn[];
        busy?: boolean;
        inFlight?: number;
        maxTurns?: number;
      };
      if (Array.isArray(parsed.turns)) {
        turns = parsed.turns.map((t) =>
          t.pending ? { ...t, pending: false } : t,
        );
      }
      if (typeof parsed.maxTurns === "number") maxTurns = parsed.maxTurns;
    }
  } catch {
    /* private mode */
  }
  busy = false;
  inFlight = 0;
  return {
    draft,
    turns,
    busy,
    inFlight,
    error: null,
    loadingHistory: false,
    // Always sync once from server; merge keeps local pending turns.
    historyLoaded: false,
    maxTurns,
    notifyPerm:
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  };
}

function persistSession(agentId: AgentChatRole): void {
  const state = states[agentId];
  try {
    sessionStorage.setItem(
      SESSION_KEY(agentId),
      JSON.stringify({
        turns: state.turns,
        busy: state.busy,
        inFlight: state.inFlight,
        maxTurns: state.maxTurns,
      }),
    );
  } catch {
    /* ignore */
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(agentId: AgentChatRole, partial: Partial<AgentChatState>): void {
  states[agentId] = { ...states[agentId], ...partial };
  if (
    partial.turns !== undefined ||
    partial.busy !== undefined ||
    partial.inFlight !== undefined ||
    partial.maxTurns !== undefined
  ) {
    persistSession(agentId);
  }
  emit();
}

export function getAgentChatState(agentId: AgentChatRole): AgentChatState {
  return states[agentId];
}

export function subscribeAgentChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAgentChatDraft(agentId: AgentChatRole, draft: string): void {
  patch(agentId, { draft });
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY(agentId), draft);
    else sessionStorage.removeItem(DRAFT_KEY(agentId));
  } catch {
    /* ignore */
  }
}

export function setAgentChatNotifyPerm(
  agentId: AgentChatRole,
  notifyPerm: NotificationPermission | "unsupported",
): void {
  patch(agentId, { notifyPerm });
}

export async function ensureAgentChatHistory(agentId: AgentChatRole): Promise<void> {
  const current = states[agentId];
  if (current.historyLoaded || current.loadingHistory) return;
  patch(agentId, { loadingHistory: true, error: null });
  try {
    const thread = await fetchChatThread(agentId);
    const next = states[agentId];
    // Do not clobber an in-flight send's optimistic turns.
    if (next.busy || next.turns.some((t) => t.pending)) {
      const serverTurns = thread.messages
        .filter(
          (m): m is typeof m & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant",
        )
        .map((m, i) => ({
          id: m.turn_id ?? `${m.at}-${m.role}-${i}`,
          role: m.role as "user" | "assistant",
          content: m.content,
          at: m.at,
          turnId: m.turn_id,
          feedback: m.feedback,
        }));
      // Prefer local pending turns that are not yet on the server.
      const pendingOnly = next.turns.filter(
        (t) =>
          t.pending &&
          !serverTurns.some(
            (s) => s.role === t.role && s.content === t.content,
          ),
      );
      patch(agentId, {
        loadingHistory: false,
        historyLoaded: true,
        maxTurns: thread.settings.max_turns,
        turns: [...serverTurns, ...pendingOnly],
      });
      return;
    }
    patch(agentId, {
      loadingHistory: false,
      historyLoaded: true,
      maxTurns: thread.settings.max_turns,
      turns: thread.messages
        .filter(
          (m): m is typeof m & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant",
        )
        .map((m, i) => ({
          id: m.turn_id ?? `${m.at}-${m.role}-${i}`,
          role: m.role,
          content: m.content,
          at: m.at,
          turnId: m.turn_id,
          feedback: m.feedback,
        })),
    });
  } catch (e) {
    patch(agentId, {
      loadingHistory: false,
      historyLoaded: true,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function ensureNotifyPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  if (
    Notification.permission === "granted" ||
    Notification.permission === "denied"
  ) {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function notifyReplyReady(agentTitle: string, reply: string, ok: boolean): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const preview = formatNotificationPreview(reply);
  try {
    new Notification(ok ? `${agentTitle}` : `${agentTitle}（エラー）`, {
      body: preview || (ok ? "応答が届きました" : "応答に失敗しました"),
      tag: `orgos-agent-${agentTitle}`,
    });
  } catch {
    /* Safari may throw if not allowed in this context */
  }
}

/**
 * Send keeps running in the store even if the page unmounts / user switches
 * to the other agent. Several 依頼 on the same agent may run in parallel
 * up to MAX_AGENT_CHAT_IN_FLIGHT (LLM pool still admits by max_inflight).
 */
export async function sendAgentChatDraft(
  agentId: AgentChatRole,
  title: string,
  options: AgentChatSendOptions = {},
): Promise<void> {
  const state = states[agentId];
  const message = state.draft.trim();
  if (!message || state.inFlight >= MAX_AGENT_CHAT_IN_FLIGHT) return;

  const savedRoute = loadLlmRoute(agentId);
  const llmRoute = options.webSearch
    ? savedRoute.mode === "local"
      ? savedRoute
      : { mode: "local" as const }
    : savedRoute;
  const webSearch = {
    enabled: options.webSearch === true,
    query: options.webSearch ? message.slice(0, 500) : undefined,
  };

  if (state.notifyPerm === "default") {
    const perm = await ensureNotifyPermission();
    patch(agentId, { notifyPerm: perm });
  }

  const now = new Date().toISOString();
  const userTurn: AgentChatTurn = {
    id: `u-${Date.now()}`,
    role: "user",
    content: message,
    at: now,
    pending: true,
  };

  setAgentChatDraft(agentId, "");
  const nextInFlight = states[agentId].inFlight + 1;
  patch(agentId, {
    turns: [...states[agentId].turns, userTurn],
    busy: true,
    inFlight: nextInFlight,
    error: null,
  });

  try {
    const assistantId = `a-${Date.now()}-${userTurn.id}`;
    patch(agentId, {
      turns: [
        ...states[agentId].turns,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          at: new Date().toISOString(),
        },
      ],
    });

    let streamed = "";
    let usedStream = true;
    try {
      await sendMessageStream(
        message,
        {
          onDelta: (content) => {
            streamed += content;
            patch(agentId, {
              turns: states[agentId].turns.map((t) =>
                t.id === assistantId ? { ...t, content: streamed } : t,
              ),
            });
          },
          onDone: (payload) => {
            const reply =
              payload.reply?.trim() ||
              streamed.trim() ||
              (payload.ok ? "(empty reply)" : "応答に失敗しました");
            const maxMessages = states[agentId].maxTurns * 2;
            const remaining = Math.max(0, states[agentId].inFlight - 1);
            const nextTurns: AgentChatTurn[] = [
              ...states[agentId].turns.map((t) => {
                if (t.id === userTurn.id) return { ...t, pending: false };
                if (t.id === assistantId) {
                  return {
                    ...t,
                    content: reply,
                    turnId: undefined,
                    error: !payload.ok,
                    structured: payload.structured,
                  };
                }
                return t;
              }),
            ];
            patch(agentId, {
              turns:
                nextTurns.length > maxMessages
                  ? nextTurns.slice(-maxMessages)
                  : nextTurns,
              inFlight: remaining,
              busy: remaining > 0,
            });
            notifyReplyReady(title, reply, payload.ok);
          },
          onError: (error) => {
            throw new Error(error);
          },
        },
        { agentId, llmRoute, webSearch },
      );
    } catch {
      usedStream = false;
    }

    if (!usedStream) {
      const result = await sendMessage(message, agentId, llmRoute, webSearch);
      const reply =
        result.reply?.trim() || (result.ok ? "(empty reply)" : "応答に失敗しました");
      const maxMessages = states[agentId].maxTurns * 2;
      const remaining = Math.max(0, states[agentId].inFlight - 1);
      const nextTurns: AgentChatTurn[] = [
        ...states[agentId].turns
          .filter((t) => t.id !== assistantId)
          .map((t) => (t.id === userTurn.id ? { ...t, pending: false } : t)),
        {
          id: assistantId,
          role: "assistant",
          content: reply,
          at: new Date().toISOString(),
          turnId: result.assistant_turn_id,
          error: !result.ok || result.local_error === true,
          structured: result.structured,
          faqServed: result.faq_served,
        },
      ];
      patch(agentId, {
        turns:
          nextTurns.length > maxMessages
            ? nextTurns.slice(-maxMessages)
            : nextTurns,
        inFlight: remaining,
        busy: remaining > 0,
      });
      notifyReplyReady(title, reply, result.ok);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const remaining = Math.max(0, states[agentId].inFlight - 1);
    patch(agentId, {
      error: msg,
      inFlight: remaining,
      busy: remaining > 0,
      turns: [
        ...states[agentId].turns.map((t) =>
          t.id === userTurn.id ? { ...t, pending: false } : t,
        ),
        {
          id: `e-${Date.now()}-${userTurn.id}`,
          role: "assistant",
          content: msg,
          at: new Date().toISOString(),
          error: true,
        },
      ],
    });
    notifyReplyReady(title, msg, false);
  }
}

export async function enableAgentChatNotifications(
  agentId: AgentChatRole,
): Promise<void> {
  const perm = await ensureNotifyPermission();
  setAgentChatNotifyPerm(agentId, perm);
}

export async function rateAgentChatTurn(
  agentId: AgentChatRole,
  turnId: string,
  rating: "good" | "bad",
): Promise<void> {
  await submitChatFeedback({ turnId, rating, agentId });
  const state = states[agentId];
  patch(agentId, {
    turns: state.turns.map((t) =>
      t.turnId === turnId || t.id === turnId ? { ...t, turnId, feedback: rating } : t,
    ),
  });
}
