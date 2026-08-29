import {
  buildDataQualityView,
  buildKpiScorecardView,
  buildMetricCatalogView,
  formatDataQualityMarkdown,
  formatKpiScorecardMarkdown,
  formatMetricCatalogMarkdown,
  writeAnalyticsMonthlySnapshot,
} from "../lib/analytics/index.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export function runAnalyticsMetrics(options?: { json?: boolean }): void {
  const view = buildMetricCatalogView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatMetricCatalogMarkdown(view));
}

export function runAnalyticsKpi(options?: { json?: boolean; fiscalYear?: string }): void {
  const view = buildKpiScorecardView({ fiscalYear: options?.fiscalYear });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatKpiScorecardMarkdown(view));
}

export function runAnalyticsQuality(options?: { json?: boolean }): void {
  const view = buildDataQualityView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatDataQualityMarkdown(view));
}

export function runAnalyticsSnapshot(options?: {
  month?: string;
  asOf?: string;
  output?: string;
  force?: boolean;
}): void {
  requireCliReportWrite("analytics snapshot");
  const result = writeAnalyticsMonthlySnapshot({
    month: options?.month,
    asOf: options?.asOf,
    output: options?.output,
    force: options?.force,
  });
  console.log(`✓ Analytics snapshot: ${result.path}`);
  console.log(`  month ${result.month} · values as of ${result.as_of}`);
  console.log(formatKpiScorecardMarkdown(buildKpiScorecardView({ asOf: options?.asOf })));
}
