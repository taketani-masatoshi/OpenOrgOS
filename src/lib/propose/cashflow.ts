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
