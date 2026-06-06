import { loadAllData } from "../lib/data.js";
import { runScenario, compareScenarios } from "../lib/scenario.js";
import { parsePercentChange, writeReport } from "../lib/utils.js";
import type { ScenarioOverrides } from "../lib/forecast.js";

export function runScenarioCommand(options: {
  name: string;
  months: number;
  vacancyRate?: number;
  occupancyRate?: number;
  adr?: string;
  rentChange?: string;
  interestRate?: string;
  output?: string;
}): void {
  const data = loadAllData();

  const overrides: ScenarioOverrides = {};
  if (options.vacancyRate !== undefined) overrides.vacancyRate = options.vacancyRate;
  if (options.occupancyRate !== undefined) overrides.occupancyRate = options.occupancyRate;
  if (options.adr) overrides.adrChange = parsePercentChange(options.adr);
  if (options.rentChange) overrides.rentChange = parsePercentChange(options.rentChange);
  if (options.interestRate) overrides.interestRateChange = parsePercentChange(options.interestRate);

  const baseline = runScenario(data, { name: "ベースライン", overrides: {} }, options.months);
  const scenario = runScenario(data, { name: options.name, overrides }, options.months);

  const output = compareScenarios(baseline, scenario);

  if (options.output) {
    const path = writeReport("scenario", options.output, output);
    console.log(`✓ Report saved to ${path}`);
  } else {
    console.log(output);
  }
}
