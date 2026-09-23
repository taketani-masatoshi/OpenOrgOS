/**
 * Explicit upward-dependency baseline for Agent-infra.
 * Violations may shrink over time; they must not grow.
 */

export const AGENT_INFRA_LAYER_VIOLATION_BASELINE: readonly string[] = [
  // reporting ensures workspace before mission write (out of scope peer).
  "src/lib/agents/reporting/relay.ts (reporting) -> src/lib/agent-workspace.ts (workspace_peer)",
  // pulse (out of scope) imports readiness — known cycle with readiness→pulse.
  "src/lib/agent-pulse.ts (pulse_peer) -> src/lib/agent-readiness.ts (verify)",
] as const;
