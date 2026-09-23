function isMcpRateLimitDisabled(): boolean {
  return process.env.ORGOS_MCP_RATE_LIMIT === "0";
}

const MCP_RATE_LIMIT_DEFAULT_MAX = 30;
const MCP_RATE_LIMIT_WINDOW_MS = 60_000;

function mcpRateLimitMax(): number {
  const raw = process.env.ORGOS_MCP_RATE_LIMIT_MAX?.trim();
  const n = raw ? Number.parseInt(raw, 10) : MCP_RATE_LIMIT_DEFAULT_MAX;
  return Number.isFinite(n) && n > 0 ? n : MCP_RATE_LIMIT_DEFAULT_MAX;
}

const mcpCallWindows = new Map<string, number[]>();

/** Reset in-memory MCP rate counters (tests only). */
export function resetMcpRateLimitState(): void {
  mcpCallWindows.clear();
}

export function checkMcpRateLimit(tool: string): boolean {
  if (isMcpRateLimitDisabled()) return true;
  const windowMs = MCP_RATE_LIMIT_WINDOW_MS;
  const max = mcpRateLimitMax();
  const now = Date.now();
  const key = tool;

  let timestamps = mcpCallWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    mcpCallWindows.set(key, timestamps);
  }

  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= max) return false;
  timestamps.push(now);
  return true;
}
