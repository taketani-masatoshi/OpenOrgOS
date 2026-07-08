import { loadAllData } from "../lib/data.js";
import {
  analyzeAllProperties,
  formatPropertyAnalysisMarkdown,
  parsePeriod,
} from "../lib/analyze.js";
import { writeMarkdownReport } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export function runAnalyzeProperty(options: {
  id?: string;
  period?: string;
  output?: string;
}): void {
  const data = loadAllData();
  const { from, to } = parsePeriod(options.period);

  const analyses = analyzeAllProperties(
    data.properties,
    data.propertyRevenuePlan,
    data.monthlyFinances,
    options.id,
    from,
    to
  );

  const output = formatPropertyAnalysisMarkdown(analyses);

  if (options.output) {
    requireCliReportWrite("analyze");
    const path = writeMarkdownReport("analyze", options.output, output);
    console.log(`✓ Report saved to ${path}`);
  } else {
    console.log(output);
  }
}
