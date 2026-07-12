import { loadAllData } from "../lib/data.js";
import { generateForecast, formatForecastMarkdown, formatForecastJson } from "../lib/forecast.js";
import { writeMarkdownReport, currentMonth } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export function runForecast(options: { months: number; format: string; output?: string }): void {
  const data = loadAllData();
  const forecast = generateForecast(
    data.monthlyFinances,
    data.fixedCosts,
    data.loans,
    data.propertyRevenuePlan,
    data.properties,
    { months: options.months, startMonth: currentMonth() }
  );

  let output: string;
  if (options.format === "json") {
    output = formatForecastJson(forecast);
  } else {
    output = formatForecastMarkdown(forecast);
  }

  if (options.output) {
    requireCliReportWrite("forecast");
    const path = writeMarkdownReport("forecast", options.output, output);
    console.log(`✓ Report saved to ${path}`);
  } else {
    console.log(output);
  }
}
