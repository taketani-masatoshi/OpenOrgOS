import { existsSync } from "node:fs";
import { join } from "node:path";
import { isAgentActive } from "../agent-catalog.js";
import type { IntegrityIssue } from "../integrity.js";
import { getAnalyticsDir, METRICS_CATALOG_REL } from "./load.js";

/**
 * A tenant that declares a metrics catalog must keep its owning agent on the
 * operational roster; otherwise KPI routing and readiness silently degrade.
 */
export function collectAnalyticsIntegrityIssues(): IntegrityIssue[] {
  const metricsPath = join(getAnalyticsDir(), "metrics.yaml");
  if (!existsSync(metricsPath)) return [];
  if (isAgentActive("data_analytics", { profile: "operational" })) return [];

  return [
    {
      level: "warning",
      file: METRICS_CATALOG_REL,
      message:
        "metrics catalog exists but data_analytics is not on the operational roster — " +
        "run: orgos agent roster enable --agent data_analytics",
    },
  ];
}
