import { basename } from "node:path";
import type { ChartOfAccounts } from "../../../../../../schemas/finance/types.js";

export interface ChartAccountResolutionInput {
  category: string;
  direction?: "inflow" | "outflow" | "transfer";
  chart_account_id?: string;
  data_source?: string;
}

export interface ChartAccountResolution {
  chart_account_id?: string;
  warning?: string;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Pure COA resolver. Account codes and BANK-* identifiers intentionally live in
 * separate namespaces; this function only returns codes present in accounts[].
 */
export function resolveChartAccountId(
  input: ChartAccountResolutionInput,
  chart: ChartOfAccounts
): ChartAccountResolution {
  if (input.chart_account_id) {
    return { chart_account_id: input.chart_account_id };
  }

  const category = normalize(input.category);
  const dataSource = input.data_source;
  const sourceCode = dataSource
    ? chart.accounts.find(
        (account) =>
          account.data_source &&
          normalize(basename(account.data_source)) === normalize(basename(dataSource))
      )?.code
    : undefined;
  const mappings =
    input.direction === "inflow"
      ? [chart.category_mapping.revenue]
      : input.direction === "outflow"
        ? [chart.category_mapping.expense]
        : [chart.category_mapping.revenue, chart.category_mapping.expense];
  const mappedCode = mappings
    .flatMap((mapping) => Object.entries(mapping))
    .find(([key]) => normalize(key) === category)?.[1];
  const namedCode = chart.accounts.find(
    (account) => normalize(account.name) === category
  )?.code;
  const code = sourceCode ?? mappedCode ?? namedCode;

  if (code && chart.accounts.some((account) => account.code === code)) {
    return { chart_account_id: code };
  }
  return {
    warning: `${input.category}: chart account could not be resolved`,
  };
}
