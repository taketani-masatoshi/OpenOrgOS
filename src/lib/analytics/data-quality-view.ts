import { computeDataHealth, type DataHealthReport } from "../data-health.js";
import type { MetricResolverCache } from "./resolvers.js";
import { currentDate } from "../utils.js";

export interface DataQualityView {
  as_of: string;
  report: DataHealthReport;
}

export function buildDataQualityView(opts?: {
  asOf?: string;
  cache?: MetricResolverCache;
}): DataQualityView {
  return {
    as_of: opts?.asOf ?? currentDate(),
    report: opts?.cache?.dataHealth() ?? computeDataHealth(),
  };
}

export function formatDataQualityMarkdown(view: DataQualityView): string {
  const { report } = view;
  const lines = [
    `# データ品質 — ${view.as_of}`,
    "",
    `**総合:** ${report.overall}/100（${report.grade}）`,
    "",
    "| 指標 | スコア | 詳細 |",
    "|------|------:|------|",
  ];
  for (const m of report.metrics) {
    lines.push(`| ${m.label} | ${m.score}/${m.max} | ${m.detail} |`);
  }
  if (report.recommendations.length) {
    lines.push("", "## 推奨", "");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function formatDataQualityCeoReply(view: DataQualityView): string {
  const { report } = view;
  const top = report.recommendations.slice(0, 2).join(" · ");
  return `データ品質 ${report.overall}/100（${report.grade}）${top ? `。${top}` : ""}`;
}
