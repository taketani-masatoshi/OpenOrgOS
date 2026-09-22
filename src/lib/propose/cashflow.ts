import { loadAllData, loadCashBalance, resolveCashBalanceTotal } from "../data.js";
import { generateForecast } from "../forecast.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type CashFlow = { date: string; yen: number };

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Month-end net cash flows from the existing forecast engine (monthly finances + plans).
 * Covers months that intersect [from, to].
 */
export function flowsFromForecast(from: string, to: string): {
  flows: CashFlow[];
  inputs_ref: string[];
} {
  try {
    const data = loadAllData();
    const startMonth = from.slice(0, 7);
    const endMonth = to.slice(0, 7);
    const months = Math.max(
      1,
      (Number(endMonth.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 +
        (Number(endMonth.slice(5, 7)) - Number(startMonth.slice(5, 7))) +
        1,
    );
    const forecast = generateForecast(
      data.monthlyFinances,
      data.fixedCosts,
      data.loans,
      data.propertyRevenuePlan,
      data.properties,
      { months, startMonth },
    );
    const flows = forecast
      .map((row) => ({ date: lastDayOfMonth(row.month), yen: row.netCashFlow }))
      .filter((row) => row.date >= from && row.date <= to);
    const inputs_ref: string[] = [];
    if (data.monthlyFinances.length > 0) inputs_ref.push("data/finance/monthly/");
    if (data.fixedCosts) inputs_ref.push("data/finance/fixed-costs.yaml");
    if (data.loans) inputs_ref.push("data/finance/loans.yaml");
    return { flows, inputs_ref };
  } catch {
    return { flows: [], inputs_ref: [] };
  }
}

export function buildDailyCashSeries(input: {
  openingYen: number;
  from: string;
  to: string;
  flows: CashFlow[];
  orders?: CashFlow[];
  recurring?: CashFlow[];
}): Array<{ date: string; balanceYen: number }> {
  const series: Array<{ date: string; balanceYen: number }> = [];
  let balance = input.openingYen;
  const flows = [...input.flows, ...(input.orders ?? []), ...(input.recurring ?? [])];
  const cursor = new Date(`${input.from}T00:00:00Z`);
  const end = new Date(`${input.to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    for (const flow of flows) {
      if (flow.date === date) balance += flow.yen;
    }
    series.push({ date, balanceYen: balance });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

/** Opening from cash-balance.yaml when openingYen is omitted. */
export function resolveOpeningYen(explicit?: number): {
  openingYen: number;
  inputs_ref: string[];
} {
  if (explicit != null) return { openingYen: explicit, inputs_ref: [] };
  const balance = loadCashBalance();
  if (!balance) return { openingYen: 0, inputs_ref: [] };
  const total = resolveCashBalanceTotal(balance);
  return {
    openingYen: total ?? 0,
    inputs_ref: ["data/finance/cash-balance.yaml"],
  };
}

/** One report. Omit flows to assemble month-end nets from forecast SoT. No graph UI. */
export function renderCashflowReport(input: {
  openingYen?: number;
  from: string;
  to: string;
  flows?: CashFlow[];
  orders?: CashFlow[];
  recurring?: CashFlow[];
}): Record<string, unknown> {
  const opening = resolveOpeningYen(input.openingYen);
  const inputs_ref = [...opening.inputs_ref];
  let flows = input.flows;
  let autoImport = false;
  if (!flows) {
    const loaded = flowsFromForecast(input.from, input.to);
    flows = loaded.flows;
    inputs_ref.push(...loaded.inputs_ref);
    autoImport = loaded.flows.length > 0;
  }
  const series = buildDailyCashSeries({
    openingYen: opening.openingYen,
    from: input.from,
    to: input.to,
    flows,
    orders: input.orders,
    recurring: input.recurring,
  });
  return flattenProposeReport(
    makeProposeReport({
      kind: "cashflow-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        series,
        openingYen: opening.openingYen,
        autoImport,
        graphUi: false,
      },
    }),
  );
}
