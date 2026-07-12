/**
 * Injectable clock and ID generation for deterministic domain tests and replay.
 * Default: system Date / Math.random. Tests: setRuntimeContext({ clock, idGenerator }).
 */

import { randomUUID } from "node:crypto";

export interface Clock {
  now(): Date;
  nowMs(): number;
  nowIso(): string;
}

export interface IdGenerator {
  randomSuffix(length?: number): string;
  uniqueId(prefix: string): string;
  /** Stable UUID-shaped id (default: crypto.randomUUID). */
  uuid(): string;
}

const defaultClock = (): Clock => ({
  now: () => new Date(),
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
});

const defaultIdGenerator = (): IdGenerator => ({
  randomSuffix: (length = 8) => Math.random().toString(36).slice(2, 2 + length),
  uniqueId: (prefix: string) => {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${clock.nowMs()}-${suffix}`;
  },
  uuid: () => randomUUID(),
});

let clock: Clock = defaultClock();
let idGenerator: IdGenerator = defaultIdGenerator();

export function getClock(): Clock {
  return clock;
}

export function getIdGenerator(): IdGenerator {
  return idGenerator;
}

export function setRuntimeContext(ctx: {
  clock?: Clock;
  idGenerator?: IdGenerator;
}): void {
  if (ctx.clock) clock = ctx.clock;
  if (ctx.idGenerator) idGenerator = ctx.idGenerator;
}

export function resetRuntimeContext(): void {
  clock = defaultClock();
  idGenerator = defaultIdGenerator();
}
