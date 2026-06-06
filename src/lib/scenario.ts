import type { StewardData } from "./data.js";
import {
  generateForecast,
  formatForecastMarkdown,
  type ScenarioOverrides,
} from "./forecast.js";
import { formatCurrency } from "./utils.js";

export interface ScenarioOptions {
  name: string;
  overrides: ScenarioOverrides;
}

export interface ScenarioResult {
  name: string;
  forecast: ReturnType<typeof generateForecast>;
  totalNetCashFlow: number;
  averageMonthlyNetCashFlow: number;
}

export function runScenario(
  data: StewardData,
  options: ScenarioOptions,
  months = 12
): ScenarioResult {
  const forecast = generateForecast(
    data.monthlyFinances,
    data.fixedCosts,
    data.loans,
    data.propertyRevenuePlan,
    data.properties,
    { months },
    options.overrides
  );

  const totalNetCashFlow = forecast.reduce((s, f) => s + f.netCashFlow, 0);
  const averageMonthlyNetCashFlow = totalNetCashFlow / forecast.length;

  return {
    name: options.name,
    forecast,
    totalNetCashFlow,
    averageMonthlyNetCashFlow,
  };
}

export function compareScenarios(
  baseline: ScenarioResult,
  scenario: ScenarioResult
): string {
  const lines = [
    "# シナリオ分析",
    "",
    `## 比較: ベースライン vs ${scenario.name}`,
    "",
    "| 指標 | ベースライン | シナリオ | 差異 |",
    "|---|---:|---:|---:|",
    `| 合計純CF (${baseline.forecast.length}ヶ月) | ${formatCurrency(baseline.totalNetCashFlow)} | ${formatCurrency(scenario.totalNetCashFlow)} | ${formatCurrency(scenario.totalNetCashFlow - baseline.totalNetCashFlow)} |`,
    `| 平均月次純CF | ${formatCurrency(baseline.averageMonthlyNetCashFlow)} | ${formatCurrency(scenario.averageMonthlyNetCashFlow)} | ${formatCurrency(scenario.averageMonthlyNetCashFlow - baseline.averageMonthlyNetCashFlow)} |`,
    "",
    "## ベースライン詳細",
    "",
    formatForecastMarkdown(baseline.forecast, "ベースライン CF予測"),
    "",
    `## ${scenario.name} 詳細`,
    "",
    formatForecastMarkdown(scenario.forecast, `${scenario.name} CF予測`),
  ];

  return lines.join("\n");
}
