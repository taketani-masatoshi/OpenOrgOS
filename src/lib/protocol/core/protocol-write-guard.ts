/** Gate protocol outbox writes — only steward protocol code paths may persist envelopes. */

let writeDepth = 0;
let currentSource = "";

export function isProtocolWriteGuardDisabled(): boolean {
  return process.env.STEWARD_PROTOCOL_WRITE_GUARD === "off";
}

export function runWithProtocolWriteGuard<T>(source: string, fn: () => T): T {
  if (isProtocolWriteGuardDisabled()) {
    return fn();
  }
  writeDepth++;
  const prev = currentSource;
  currentSource = source;
  try {
    return fn();
  } finally {
    writeDepth--;
    currentSource = prev;
  }
}

export async function runWithProtocolWriteGuardAsync<T>(
  source: string,
  fn: () => Promise<T>
): Promise<T> {
  if (isProtocolWriteGuardDisabled()) {
    return fn();
  }
  writeDepth++;
  const prev = currentSource;
  currentSource = source;
  try {
    return await fn();
  } finally {
    writeDepth--;
    currentSource = prev;
  }
}

export function assertProtocolWriteAuthorized(): void {
  if (isProtocolWriteGuardDisabled()) return;
  if (writeDepth <= 0) {
    throw new Error(
      "Protocol outbox write rejected — use `steward protocol` CLI (direct outbox file writes are blocked)"
    );
  }
}

export function currentProtocolWriteSource(): string {
  return currentSource;
}
