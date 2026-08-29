import { buildFaqIndex } from "./faq-index.js";
import { isAnswerMemoryEnabled } from "./answer-memory.js";

let idleTimer: ReturnType<typeof setTimeout> | undefined;
let building = false;

function idleDelayMs(): number {
  const raw = Number(process.env.ORGOS_CHAT_FAQ_IDLE_MS ?? "300000");
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 300_000;
}

export function isFaqIdleBuildEnabled(): boolean {
  return process.env.ORGOS_CHAT_FAQ_IDLE_BUILD !== "0";
}

/** Debounced FAQ rebuild after chat activity quiets down. */
export function touchChatActivityForFaq(): void {
  if (!isFaqIdleBuildEnabled() || !isAnswerMemoryEnabled()) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    void runIdleFaqBuild();
  }, idleDelayMs());
}

export async function runIdleFaqBuild(): Promise<{ entries: number } | null> {
  if (building || !isAnswerMemoryEnabled()) return null;
  building = true;
  try {
    const result = buildFaqIndex();
    return { entries: result.entries };
  } finally {
    building = false;
  }
}

/** For tests — cancel pending idle timer. */
export function resetFaqIdleScheduler(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  building = false;
}
