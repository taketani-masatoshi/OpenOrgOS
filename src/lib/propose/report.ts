import {
  proposeReportEnvelopeSchema,
  type ProposeHumanGate,
  type ProposeReportEnvelope,
} from "../../../schemas/propose-report.js";

export type ProposeDepth = "L0" | "L1" | "L2";

const DEFAULT_GATE: ProposeHumanGate = { apply: "human" };

/**
 * Build a typed propose report envelope.
 * Callers keep domain fields in payload; doctrine gates stay on human_gate.
 */
export function makeProposeReport(input: {
  kind: string;
  depth: ProposeDepth;
  payload: Record<string, unknown>;
  inputs_ref?: string[];
  human_gate?: Partial<ProposeHumanGate>;
  generated_at?: string;
}): ProposeReportEnvelope {
  return proposeReportEnvelopeSchema.parse({
    kind: input.kind,
    version: 1,
    generated_at: input.generated_at ?? new Date().toISOString(),
    inputs_ref: input.inputs_ref ?? [],
    human_gate: { ...DEFAULT_GATE, ...input.human_gate, apply: "human" as const },
    depth: input.depth,
    payload: input.payload,
  });
}

/** Flatten envelope + payload for CLI JSON that still exposes legacy top-level fields. */
export function flattenProposeReport(
  report: ProposeReportEnvelope,
): Record<string, unknown> {
  return {
    kind: report.kind,
    version: report.version,
    generated_at: report.generated_at,
    inputs_ref: report.inputs_ref,
    human_gate: report.human_gate,
    depth: report.depth,
    ...report.payload,
  };
}
