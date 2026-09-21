import { classifyWork } from "../dispatch-tower/classify.js";
import {
  dispatchTowerRegistryPath,
  loadDispatchTowerRegistry,
} from "../dispatch-tower/registry-loader.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

/**
 * Propose-only tower classification report.
 * Does not assign work orders or execute skills.
 */
export function renderTowerClassifyReport(text: string): Record<string, unknown> {
  const classification = classifyWork(text);
  const inputs_ref: string[] = [];
  try {
    loadDispatchTowerRegistry();
    inputs_ref.push("steward/core/dispatch-tower/registry.yaml");
  } catch {
    // empty registry still classifies; depth stays L1
  }
  return flattenProposeReport(
    makeProposeReport({
      kind: "tower-classify-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        text,
        classification,
        registryPath: dispatchTowerRegistryPath(),
        applied: false,
        assigned: false,
      },
    }),
  );
}
