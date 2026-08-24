/**
 * Roll up expense / budget allocations by BU · org · employee (IDs only).
 */
import type { CostAllocationSlice } from "../../../schemas/finance/cost-allocation.js";
import type { ExpensePlan } from "../../../schemas/plan.js";
import type { MonthlyFinance } from "../../../schemas/finance.js";

export type AllocationAxisKey =
  | { kind: "business_unit"; id: string }
  | { kind: "org_unit"; id: string }
  | { kind: "employee"; id: string }
  | { kind: "unallocated" };

export type AllocationRollupRow = {
  business_unit_id: string;
  org_unit_id: string;
  employee_id?: string;
  plan_amount: number;
  actual_amount: number;
};

function keyOf(a: {
  business_unit_id: string;
  org_unit_id: string;
  employee_id?: string;
}): string {
  return `${a.business_unit_id}|${a.org_unit_id}|${a.employee_id ?? ""}`;
}

function addSlice(
  map: Map<string, AllocationRollupRow>,
  slice: CostAllocationSlice,
  side: "plan" | "actual"
): void {
  const k = keyOf(slice);
  const cur = map.get(k) ?? {
    business_unit_id: slice.business_unit_id,
    org_unit_id: slice.org_unit_id,
    employee_id: slice.employee_id,
    plan_amount: 0,
    actual_amount: 0,
  };
  if (side === "plan") cur.plan_amount += slice.amount;
  else cur.actual_amount += slice.amount;
  map.set(k, cur);
}

export function assertAllocationsSum(
  parentAmount: number,
  allocations: CostAllocationSlice[] | undefined,
  label: string
): void {
  if (!allocations?.length) return;
  const sum = allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(sum - Math.abs(parentAmount)) > 0.01) {
    throw new Error(
      `${label}: allocations sum ${sum} != parent amount ${parentAmount}`
    );
  }
}

export function rollupExpensePlanAllocations(
  plan: ExpensePlan,
  fiscalYear: string
): AllocationRollupRow[] {
  const year = plan.years.find((y) => y.fiscal_year === fiscalYear);
  const map = new Map<string, AllocationRollupRow>();
  for (const line of year?.lines ?? []) {
    assertAllocationsSum(line.amount, line.allocations, line.id);
    if (line.allocations?.length) {
      for (const a of line.allocations) addSlice(map, a, "plan");
    } else {
      addSlice(
        map,
        {
          business_unit_id: "BU-UNALLOCATED",
          org_unit_id: "UNALLOCATED",
          amount: Math.abs(line.amount),
        },
        "plan"
      );
    }
  }
  return [...map.values()].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b))
  );
}

export function rollupMonthlyExpenseAllocations(
  months: MonthlyFinance[]
): AllocationRollupRow[] {
  const map = new Map<string, AllocationRollupRow>();
  for (const month of months) {
    for (const [idx, exp] of month.expenses.entries()) {
      // CAPEX is an investment outflow, not an OPEX budget-consumption row.
      if (exp.category === "capex") continue;
      assertAllocationsSum(
        exp.amount,
        exp.allocations,
        `${month.month}#${idx}`
      );
      if (exp.allocations?.length) {
        for (const a of exp.allocations) addSlice(map, a, "actual");
      } else {
        addSlice(
          map,
          {
            business_unit_id: "BU-UNALLOCATED",
            org_unit_id: "UNALLOCATED",
            amount: Math.abs(exp.amount),
          },
          "actual"
        );
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b))
  );
}

export function mergeAllocationRollups(
  planRows: AllocationRollupRow[],
  actualRows: AllocationRollupRow[]
): AllocationRollupRow[] {
  const map = new Map<string, AllocationRollupRow>();
  for (const r of planRows) {
    map.set(keyOf(r), { ...r });
  }
  for (const r of actualRows) {
    const k = keyOf(r);
    const cur = map.get(k);
    if (cur) {
      cur.actual_amount += r.actual_amount;
    } else {
      map.set(k, { ...r });
    }
  }
  return [...map.values()].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b))
  );
}

export function groupByBusinessUnit(
  rows: AllocationRollupRow[]
): Array<{
  business_unit_id: string;
  plan_amount: number;
  actual_amount: number;
}> {
  const map = new Map<string, { plan_amount: number; actual_amount: number }>();
  for (const r of rows) {
    const cur = map.get(r.business_unit_id) ?? {
      plan_amount: 0,
      actual_amount: 0,
    };
    cur.plan_amount += r.plan_amount;
    cur.actual_amount += r.actual_amount;
    map.set(r.business_unit_id, cur);
  }
  return [...map.entries()]
    .map(([business_unit_id, v]) => ({ business_unit_id, ...v }))
    .sort((a, b) => a.business_unit_id.localeCompare(b.business_unit_id));
}

export function groupByOrgUnit(
  rows: AllocationRollupRow[]
): Array<{
  org_unit_id: string;
  plan_amount: number;
  actual_amount: number;
}> {
  const map = new Map<string, { plan_amount: number; actual_amount: number }>();
  for (const r of rows) {
    const cur = map.get(r.org_unit_id) ?? { plan_amount: 0, actual_amount: 0 };
    cur.plan_amount += r.plan_amount;
    cur.actual_amount += r.actual_amount;
    map.set(r.org_unit_id, cur);
  }
  return [...map.entries()]
    .map(([org_unit_id, v]) => ({ org_unit_id, ...v }))
    .sort((a, b) => a.org_unit_id.localeCompare(b.org_unit_id));
}

export function groupByEmployee(
  rows: AllocationRollupRow[]
): Array<{
  employee_id: string;
  plan_amount: number;
  actual_amount: number;
}> {
  const map = new Map<string, { plan_amount: number; actual_amount: number }>();
  for (const r of rows) {
    const id = r.employee_id ?? "UNASSIGNED";
    const cur = map.get(id) ?? { plan_amount: 0, actual_amount: 0 };
    cur.plan_amount += r.plan_amount;
    cur.actual_amount += r.actual_amount;
    map.set(id, cur);
  }
  return [...map.entries()]
    .map(([employee_id, v]) => ({ employee_id, ...v }))
    .sort((a, b) => a.employee_id.localeCompare(b.employee_id));
}

/** Ensure no L2-looking personal values in rollup keys (IDs only). */
export function assertAllocationIdsOnly(rows: AllocationRollupRow[]): void {
  for (const r of rows) {
    if (r.employee_id && !/^EMP-\d{3,}$/.test(r.employee_id) && r.employee_id !== "UNASSIGNED") {
      throw new Error(`Invalid employee_id in allocation: ${r.employee_id}`);
    }
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(r.business_unit_id + r.org_unit_id)) {
      throw new Error("Allocation axes must be IDs, not personal names");
    }
  }
}
