import { fetchChatThread, sendMessage, type OperatorStructured } from "./api";
import { formatNotificationPreview } from "./notificationPreview";

export type AgentChatRole = "secretary" | "executive_steward";

export type AgentChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at?: string;
  error?: boolean;
  /** Optimistic user turn not yet confirmed on disk. */
  pending?: boolean;
  structured?: OperatorStructured;
};

type AgentChatState = {
  draft: string;
  turns: AgentChatTurn[];
  busy: boolean;
  error: string | null;
  loadingHistory: boolean;
  historyLoaded: boolean;
  maxTurns: number;
  notifyPerm: NotificationPermission | "unsupported";
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
  let maxTurns = 10;
  try {
    draft = sessionStorage.getItem(DRAFT_KEY(agentId)) ?? "";
    const raw = sessionStorage.getItem(SESSION_KEY(agentId));
    if (raw) {
      const parsed = JSON.parse(raw) as {
        turns?: AgentChatTurn[];
        busy?: boolean;
        maxTurns?: number;
      };
      if (Array.isArray(parsed.turns)) turns = parsed.turns;
      if (typeof parsed.busy === "boolean") busy = parsed.busy;
      if (typeof parsed.maxTurns === "number") maxTurns = parsed.maxTurns;
    }
  } catch {
    /* private mode */
  }
  return {
    draft,
    turns,
    busy,
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
          id: `${m.at}-${m.role}-${i}`,
          role: m.role as "user" | "assistant",
          content: m.content,
          at: m.at,
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
          id: `${m.at}-${m.role}-${i}`,
          role: m.role,
          content: m.content,
          at: m.at,
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
 * to the other agent — so concurrent secretary + steward requests both survive.
 */
export async function sendAgentChatDraft(
  agentId: AgentChatRole,
  title: string,
): Promise<void> {
  const state = states[agentId];
  const message = state.draft.trim();
  if (!message || state.busy) return;

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
  patch(agentId, {
    turns: [...states[agentId].turns, userTurn],
    busy: true,
    error: null,
  });

  try {
    const result = await sendMessage(message, agentId);
    const reply =
      result.reply?.trim() || (result.ok ? "(empty reply)" : "応答に失敗しました");
    const maxMessages = states[agentId].maxTurns * 2;
    const nextTurns: AgentChatTurn[] = [
      ...states[agentId].turns.map((t) =>
        t.id === userTurn.id ? { ...t, pending: false } : t,
      ),
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: reply,
        at: new Date().toISOString(),
        error: !result.ok,
        structured: result.structured,
      },
    ];
    patch(agentId, {
      turns:
        nextTurns.length > maxMessages
          ? nextTurns.slice(-maxMessages)
          : nextTurns,
      busy: false,
    });
    notifyReplyReady(title, reply, result.ok);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    patch(agentId, {
      error: msg,
      busy: false,
      turns: [
        ...states[agentId].turns.map((t) =>
          t.id === userTurn.id ? { ...t, pending: false } : t,
        ),
        {
          id: `e-${Date.now()}`,
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
