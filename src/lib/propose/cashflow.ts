import { loadCashBalance, resolveCashBalanceTotal } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type CashFlow = { date: string; yen: number };

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

/** One report. Orders/recurring are passed in — no auto import or graph UI. */
export function renderCashflowReport(input: {
  openingYen?: number;
  from: string;
  to: string;
  flows: CashFlow[];
  orders?: CashFlow[];
  recurring?: CashFlow[];
}): Record<string, unknown> {
  const opening = resolveOpeningYen(input.openingYen);
  const series = buildDailyCashSeries({
    openingYen: opening.openingYen,
    from: input.from,
    to: input.to,
    flows: input.flows,
    orders: input.orders,
    recurring: input.recurring,
  });
  return flattenProposeReport(
    makeProposeReport({
      kind: "cashflow-report",
      depth: opening.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: opening.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        series,
        openingYen: opening.openingYen,
        autoImport: false,
        graphUi: false,
      },
    }),
  );
}
