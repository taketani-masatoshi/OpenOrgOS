import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  jsoxEvaluate,
  jsoxGaps,
  jsoxStatus,
} from "../jsox.js";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

function jsoxInputsRef(): string[] {
  const base = join(getDataDir(), "jp-jsox");
  const refs: string[] = [];
  for (const name of ["scope.yaml", "processes.yaml", "itgc.yaml"] as const) {
    if (existsSync(join(base, name))) refs.push(`data/jp-jsox/${name}`);
  }
  return refs;
}

/** Status + gaps. Does not sign or file an internal control report. */
export function renderJsoxStatusReport(): Record<string, unknown> {
  const inputs_ref = jsoxInputsRef();
  return flattenProposeReport(
    makeProposeReport({
      kind: "jsox-status-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        status: jsoxStatus(),
        gaps: jsoxGaps(),
        internalControlReport: false,
        edinetFiled: false,
      },
    }),
  );
}

/**
 * Evaluation proposal. Finance self-evaluation stays refused.
 * Signing stays on iso audit sign (human).
 */
export function renderJsoxEvaluateReport(operatorId: string): Record<string, unknown> {
  const inputs_ref = jsoxInputsRef();
  const result = jsoxEvaluate(operatorId);
  return flattenProposeReport(
    makeProposeReport({
      kind: "jsox-evaluate-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        operatorId,
        ok: result.ok,
        refused: result.refused ?? null,
        gaps: result.gaps,
        signed: false,
        internalControlReport: false,
        edinetFiled: false,
      },
    }),
  );
}
