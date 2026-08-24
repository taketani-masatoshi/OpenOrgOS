/**
 * Small web UX helpers (readable for beginners).
 *
 * - createSubmitGuard: stop double-submit when users mash the button
 * - withRetry: retry flaky network reads a few times
 * - band helpers: decide when board_event_id / increase-lock UI is needed
 */

/** Blocks overlapping async submits (busy lock). Returns undefined if already running. */
export function createSubmitGuard() {
  let locked = false;
  return {
    get busy() {
      return locked;
    },
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (locked) return undefined;
      locked = true;
      try {
        return await fn();
      } finally {
        locked = false;
      }
    },
  };
}

/**
 * Like createSubmitGuard, but overlapping calls coalesce into a follow-up run
 * with the latest args (BroadcastChannel + poll must not drop refreshes).
 * Optional `merge` preserves fields (e.g. notice) when a later call omits them.
 */
export function createCoalescingRunner<TArgs>(
  merge?: (previous: TArgs, next: TArgs) => TArgs,
) {
  let locked = false;
  let pending: TArgs | null = null;
  let inFlight: TArgs | null = null;
  return {
    get busy() {
      return locked;
    },
    async run(args: TArgs, fn: (args: TArgs) => Promise<void>): Promise<void> {
      if (locked) {
        const base = pending ?? inFlight;
        pending = base && merge ? merge(base, args) : args;
        return;
      }
      locked = true;
      let current: TArgs | null = args;
      try {
        while (current !== null) {
          inFlight = current;
          pending = null;
          await fn(current);
          current = pending;
          pending = null;
        }
      } finally {
        inFlight = null;
        locked = false;
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry a network call. Default: 3 attempts with 400ms, 800ms backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const delayMs = options?.delayMs ?? 400;
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastError;
}

/** Outside plan ±adjustment band → beyond_policy (needs board_event_id). */
export function isBeyondAdjustmentBand(
  amountYen: number,
  minYen?: number,
  maxYen?: number,
): boolean {
  if (minYen == null || maxYen == null) return false;
  return amountYen < minYen || amountYen > maxYen;
}

/** Unapproved business plan blocks envelope increases only. */
export function isBlockedIncrease(
  increasesLocked: boolean,
  currentYen: number,
  nextYen: number,
): boolean {
  return increasesLocked && nextYen > currentYen;
}
