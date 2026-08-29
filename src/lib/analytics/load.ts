import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  kpiTargetsFileSchema,
  metricsCatalogFileSchema,
  snapshotHistoryFileSchema,
  type KpiTargetsFile,
  type MetricsCatalogFile,
} from "../../../schemas/analytics/index.js";
import { getDataDir, readYamlFile } from "../utils.js";

export const ANALYTICS_DIR_REL = "data/analytics";
export const METRICS_CATALOG_REL = "data/analytics/metrics.yaml";
export const KPI_TARGETS_REL = "data/analytics/kpi-targets.yaml";
export const SNAPSHOT_HISTORY_FILE_REL = "data/analytics/snapshot-history.yaml";

export interface AnalyticsSchemaIssue {
  file: string;
  message: string;
}

export interface LoadedAnalytics {
  present: boolean;
  catalog: MetricsCatalogFile | null;
  targets: KpiTargetsFile | null;
}

export function getAnalyticsDir(): string {
  return join(getDataDir(), "analytics");
}

export function analyticsDirExists(): boolean {
  return existsSync(getAnalyticsDir());
}

export function loadAnalyticsCatalog(): LoadedAnalytics {
  const dir = getAnalyticsDir();
  if (!existsSync(dir)) {
    return { present: false, catalog: null, targets: null };
  }

  const metricsPath = join(dir, "metrics.yaml");
  const targetsPath = join(dir, "kpi-targets.yaml");
  let catalog: MetricsCatalogFile | null = null;
  let targets: KpiTargetsFile | null = null;

  if (existsSync(metricsPath)) {
    catalog = readYamlFile(metricsPath, metricsCatalogFileSchema);
  }
  if (existsSync(targetsPath)) {
    targets = readYamlFile(targetsPath, kpiTargetsFileSchema);
  }

  return { present: true, catalog, targets };
}

/** Schema checks for `orgos validate` (optional when dir is absent). */
export function collectAnalyticsSchemaErrors(): AnalyticsSchemaIssue[] {
  const dir = getAnalyticsDir();
  if (!existsSync(dir)) return [];

  const errors: AnalyticsSchemaIssue[] = [];
  const metricsPath = join(dir, "metrics.yaml");
  const targetsPath = join(dir, "kpi-targets.yaml");

  if (!existsSync(metricsPath)) {
    errors.push({
      file: METRICS_CATALOG_REL,
      message: "data/analytics/ exists but metrics.yaml is missing",
    });
  } else {
    try {
      readYamlFile(metricsPath, metricsCatalogFileSchema);
    } catch (e) {
      errors.push({
        file: METRICS_CATALOG_REL,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!existsSync(targetsPath)) {
    errors.push({
      file: KPI_TARGETS_REL,
      message: "data/analytics/ exists but kpi-targets.yaml is missing",
    });
  } else {
    try {
      const targets = readYamlFile(targetsPath, kpiTargetsFileSchema);
      const catalog = existsSync(metricsPath)
        ? readYamlFile(metricsPath, metricsCatalogFileSchema)
        : null;
      if (catalog) {
        const metricIds = new Set(catalog.metrics.map((m) => m.id));
        for (const t of targets.targets) {
          if (!metricIds.has(t.metric_id)) {
            errors.push({
              file: KPI_TARGETS_REL,
              message: `target references unknown metric_id ${t.metric_id}`,
            });
          }
        }
      }
    } catch (e) {
      errors.push({
        file: KPI_TARGETS_REL,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (existsSync(metricsPath)) {
    try {
      const catalog = readYamlFile(metricsPath, metricsCatalogFileSchema);
      const seen = new Set<string>();
      for (const metric of catalog.metrics) {
        if (seen.has(metric.id)) {
          errors.push({
            file: METRICS_CATALOG_REL,
            message: `duplicate metric id ${metric.id}`,
          });
        }
        seen.add(metric.id);
      }
      errors.push(...collectSnapshotHistoryErrors(dir, new Set(catalog.metrics.map((m) => m.id))));
    } catch {
      /* already reported */
    }
  }

  return errors;
}

/** Month-over-month baseline must stay parseable and aligned with the catalog. */
function collectSnapshotHistoryErrors(
  dir: string,
  metricIds: Set<string>
): AnalyticsSchemaIssue[] {
  const historyPath = join(dir, "snapshot-history.yaml");
  if (!existsSync(historyPath)) return [];

  try {
    const history = readYamlFile(historyPath, snapshotHistoryFileSchema);
    const issues: AnalyticsSchemaIssue[] = [];
    const seen = new Set<string>();
    for (const entry of history.entries) {
      if (seen.has(entry.month)) {
        issues.push({
          file: SNAPSHOT_HISTORY_FILE_REL,
          message: `duplicate history month ${entry.month}`,
        });
      }
      seen.add(entry.month);
      for (const id of Object.keys(entry.values)) {
        if (!metricIds.has(id)) {
          issues.push({
            file: SNAPSHOT_HISTORY_FILE_REL,
            message: `${entry.month}: unknown metric id ${id}`,
          });
        }
      }
    }
    return issues;
  } catch (e) {
    return [
      {
        file: SNAPSHOT_HISTORY_FILE_REL,
        message: e instanceof Error ? e.message : String(e),
      },
    ];
  }
}
