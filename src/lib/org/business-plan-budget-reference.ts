/**
 * Read-only reference to revenue / expense budgets for the active plan FY.
 * Does not mutate budget-delegations — spend authority stays on the delegation ledger.
 */
import type { BusinessUnitKind } from "../../../schemas/finance/business-units.js";
import {
  loadBusinessPlan,
  loadBusinessUnits,
  loadExpensePlan,
  loadProfitPlan,
  loadRevenuePlan,
} from "../data.js";
import { resolveActiveBudgetFiscalYear } from "./budget-delegation.js";

export type PlanBudgetLineRef = {
  id: string;
  name: string;
  amount_yen: number;
  property_id?: string;
  business_unit_id?: string;
};

/** Sub-tables inside a unit (used for corporate officer / payroll split). */
export type PlanBudgetLineGroup = {
  group_id: "officer_compensation" | "personnel" | "other";
  label: string;
  total_yen: number;
  lines: PlanBudgetLineRef[];
};

export type PlanBudgetUnitGroup = {
  business_unit_id: string;
  label: string;
  kind: BusinessUnitKind | "unassigned";
  /** true when kind is corporate — UI highlights as 全社共通経費 */
  is_corporate: boolean;
  total_yen: number;
  lines: PlanBudgetLineRef[];
  /**
   * Corporate units: 役員報酬 / 人件費 / その他.
   * `personnel_subtotal_yen` = officer + personnel (会社決定の人件費総括).
   */
  line_groups?: PlanBudgetLineGroup[];
  personnel_subtotal_yen?: number;
};

export type BusinessPlanBudgetReference = {
  fiscal_year: string;
  horizon_base_fy?: string;
  business_plan_status:
    | "missing"
    | "draft"
    | "pending_approval"
    | "approved"
    | "superseded";
  business_plan_revenue_yen?: number;
  business_plan_operating_profit_yen?: number;
  business_plan_investment_yen?: number;
  revenue_plan_yen?: number;
  expense_plan_yen?: number;
  profit_plan_operating_yen?: number;
  profit_plan_sga_yen?: number;
  period_from?: string;
  period_to?: string;
  revenue_lines: PlanBudgetLineRef[];
  expense_lines: PlanBudgetLineRef[];
  /** Revenue lines grouped by business unit (property / segment map). */
  revenue_units: PlanBudgetUnitGroup[];
  /** Expense lines grouped by allocation business_unit_id. */
  expense_units: PlanBudgetUnitGroup[];
  sources: {
    business_plan: "data/plans/business-plan.yaml";
    revenue_plan: "data/plans/revenue-plan.yaml";
    expense_plan: "data/plans/expense-plan.yaml";
    profit_plan: "data/plans/profit-plan.yaml";
  };
  consistency: {
    revenue_matches_business_plan: boolean | null;
    expense_matches_profit_sga: boolean | null;
  };
};

type UnitCatalogEntry = {
  id: string;
  label: string;
  kind: BusinessUnitKind;
  property_ids: string[];
  segments: string[];
};

const UNASSIGNED: UnitCatalogEntry = {
  id: "UNASSIGNED",
  label: "未割当",
  kind: "operating",
  property_ids: [],
  segments: [],
};

/** Prefer explicit FY, else active budget FY (delegation → authority → plan → FY2026). */
export function resolveActivePlanFiscalYear(preferred?: string): string {
  const trimmed = preferred?.trim();
  if (trimmed) return trimmed;
  return resolveActiveBudgetFiscalYear();
}

function loadUnitCatalog(): UnitCatalogEntry[] {
  const file = loadBusinessUnits();
  return (file?.units ?? []).map((unit) => ({
    id: unit.id,
    label: unit.label,
    kind: unit.kind,
    property_ids: unit.property_ids ?? [],
    segments: unit.segments ?? [],
  }));
}

function findUnitById(
  catalog: UnitCatalogEntry[],
  id: string,
): UnitCatalogEntry {
  return (
    catalog.find((unit) => unit.id === id) ?? {
      id,
      label: id,
      kind: id === "BU-CORPORATE" ? ("corporate" as const) : ("operating" as const),
      property_ids: [],
      segments: [],
    }
  );
}

function resolveRevenueUnit(
  line: { name: string; property_id?: string },
  catalog: UnitCatalogEntry[],
): UnitCatalogEntry {
  if (line.property_id) {
    const byProperty = catalog.find((unit) =>
      unit.property_ids.includes(line.property_id!),
    );
    if (byProperty) return byProperty;
  }
  const bySegment = catalog.find((unit) => unit.segments.includes(line.name));
  if (bySegment) return bySegment;
  const byPartial = catalog.find((unit) =>
    unit.segments.some(
      (segment) =>
        segment !== "_corporate" &&
        (line.name.includes(segment) || segment.includes(line.name)),
    ),
  );
  if (byPartial) return byPartial;
  return UNASSIGNED;
}

function resolveExpenseUnit(
  line: {
    name: string;
    property_id?: string;
    allocations?: Array<{ business_unit_id: string; amount: number }>;
  },
  catalog: UnitCatalogEntry[],
): UnitCatalogEntry {
  const allocId = line.allocations?.[0]?.business_unit_id;
  if (allocId) return findUnitById(catalog, allocId);
  return resolveRevenueUnit(line, catalog);
}

function kindSortKey(kind: BusinessUnitKind | "unassigned"): number {
  if (kind === "operating") return 0;
  if (kind === "non_operating") return 1;
  if (kind === "corporate") return 2;
  return 3;
}

function classifyCorporateExpenseLine(
  line: PlanBudgetLineRef,
): PlanBudgetLineGroup["group_id"] {
  const id = line.id.toLowerCase();
  const name = line.name;
  if (
    id === "officer_compensation" ||
    name === "役員報酬" ||
    name.startsWith("役員報酬")
  ) {
    return "officer_compensation";
  }
  // Payroll / employer statutory costs only — not 福利厚生 or discretionary pools.
  if (
    id === "back_office_salary" ||
    id === "statutory_welfare" ||
    name.includes("人件費") ||
    name.includes("法定福利")
  ) {
    return "personnel";
  }
  return "other";
}

function buildCorporateLineGroups(
  lines: PlanBudgetLineRef[],
): {
  line_groups: PlanBudgetLineGroup[];
  personnel_subtotal_yen: number;
} {
  const buckets: Record<
    PlanBudgetLineGroup["group_id"],
    PlanBudgetLineRef[]
  > = {
    officer_compensation: [],
    personnel: [],
    other: [],
  };
  for (const line of lines) {
    buckets[classifyCorporateExpenseLine(line)].push(line);
  }
  const labels: Record<PlanBudgetLineGroup["group_id"], string> = {
    officer_compensation: "役員報酬",
    personnel: "人件費",
    other: "その他共通経費",
  };
  const order: PlanBudgetLineGroup["group_id"][] = [
    "officer_compensation",
    "personnel",
    "other",
  ];
  const line_groups = order
    .filter((groupId) => buckets[groupId].length > 0)
    .map((groupId) => ({
      group_id: groupId,
      label: labels[groupId],
      total_yen: buckets[groupId].reduce(
        (sum, line) => sum + line.amount_yen,
        0,
      ),
      lines: buckets[groupId],
    }));
  const personnel_subtotal_yen = line_groups
    .filter(
      (group) =>
        group.group_id === "officer_compensation" ||
        group.group_id === "personnel",
    )
    .reduce((sum, group) => sum + group.total_yen, 0);
  return { line_groups, personnel_subtotal_yen };
}

function groupLinesByUnit(
  items: Array<{ line: PlanBudgetLineRef; unit: UnitCatalogEntry }>,
  catalog: UnitCatalogEntry[],
): PlanBudgetUnitGroup[] {
  const order = new Map(catalog.map((unit, index) => [unit.id, index]));
  const groups = new Map<string, PlanBudgetUnitGroup>();

  for (const { line, unit } of items) {
    const existing = groups.get(unit.id);
    if (existing) {
      existing.lines.push(line);
      existing.total_yen += line.amount_yen;
      continue;
    }
    groups.set(unit.id, {
      business_unit_id: unit.id,
      label: unit.label,
      kind: unit.id === UNASSIGNED.id ? "unassigned" : unit.kind,
      is_corporate: unit.kind === "corporate",
      total_yen: line.amount_yen,
      lines: [line],
    });
  }

  return [...groups.values()]
    .map((group) => {
      if (!group.is_corporate) return group;
      const { line_groups, personnel_subtotal_yen } = buildCorporateLineGroups(
        group.lines,
      );
      return { ...group, line_groups, personnel_subtotal_yen };
    })
    .sort((a, b) => {
      const kindDelta = kindSortKey(a.kind) - kindSortKey(b.kind);
      if (kindDelta !== 0) return kindDelta;
      const orderA = order.get(a.business_unit_id) ?? 999;
      const orderB = order.get(b.business_unit_id) ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label, "ja");
    });
}

export function resolveBusinessPlanBudgetReference(
  fiscalYear?: string,
): BusinessPlanBudgetReference {
  const fy = resolveActivePlanFiscalYear(fiscalYear);
  const sources = {
    business_plan: "data/plans/business-plan.yaml" as const,
    revenue_plan: "data/plans/revenue-plan.yaml" as const,
    expense_plan: "data/plans/expense-plan.yaml" as const,
    profit_plan: "data/plans/profit-plan.yaml" as const,
  };
  const catalog = loadUnitCatalog();

  let horizonBaseFy: string | undefined;
  let businessPlanStatus: BusinessPlanBudgetReference["business_plan_status"] =
    "missing";
  let businessPlanRevenue: number | undefined;
  let businessPlanOp: number | undefined;
  let businessPlanInvestment: number | undefined;
  try {
    const plan = loadBusinessPlan();
    horizonBaseFy = plan.horizon_base_fy;
    const year = plan.years.find(
      (row) => row.fiscal_year === fy || `FY${row.year}` === fy,
    );
    if (year) {
      businessPlanStatus = year.status;
      businessPlanRevenue = year.revenue_plan;
      businessPlanOp = year.operating_profit_plan;
      businessPlanInvestment = year.investment_plan;
    }
  } catch {
    /* optional */
  }

  let revenuePlanYen: number | undefined;
  let revenueLines: PlanBudgetLineRef[] = [];
  let revenueUnits: PlanBudgetUnitGroup[] = [];
  let periodFrom: string | undefined;
  let periodTo: string | undefined;
  try {
    const year = loadRevenuePlan().years.find((row) => row.fiscal_year === fy);
    if (year) {
      revenuePlanYen = Math.abs(year.total);
      const tagged = year.lines.map((line) => {
        const unit = resolveRevenueUnit(line, catalog);
        const ref: PlanBudgetLineRef = {
          id: line.id,
          name: line.name,
          amount_yen: Math.abs(line.amount),
          property_id: line.property_id,
          business_unit_id: unit.id,
        };
        return { line: ref, unit };
      });
      revenueLines = tagged.map((row) => row.line);
      revenueUnits = groupLinesByUnit(tagged, catalog);
      periodFrom = year.period_from;
      periodTo = year.period_to;
    }
  } catch {
    /* optional */
  }

  let expensePlanYen: number | undefined;
  let expenseLines: PlanBudgetLineRef[] = [];
  let expenseUnits: PlanBudgetUnitGroup[] = [];
  try {
    const year = loadExpensePlan().years.find((row) => row.fiscal_year === fy);
    if (year) {
      expensePlanYen = Math.abs(year.total);
      const tagged = year.lines.map((line) => {
        const unit = resolveExpenseUnit(line, catalog);
        const ref: PlanBudgetLineRef = {
          id: line.id,
          name: line.name,
          amount_yen: Math.abs(line.amount),
          property_id: line.property_id,
          business_unit_id: unit.id,
        };
        return { line: ref, unit };
      });
      expenseLines = tagged.map((row) => row.line);
      expenseUnits = groupLinesByUnit(tagged, catalog);
      periodFrom = periodFrom ?? year.period_from;
      periodTo = periodTo ?? year.period_to;
    }
  } catch {
    /* optional */
  }

  let profitOp: number | undefined;
  let profitSga: number | undefined;
  try {
    const year = loadProfitPlan().years.find((row) => row.fiscal_year === fy);
    if (year) {
      profitOp = year.operating_profit;
      profitSga = Math.abs(year.sga);
    }
  } catch {
    /* optional */
  }

  const revenueMatches =
    businessPlanRevenue != null && revenuePlanYen != null
      ? businessPlanRevenue === revenuePlanYen
      : null;
  const expenseMatchesSga =
    expensePlanYen != null && profitSga != null
      ? expensePlanYen === profitSga
      : null;

  return {
    fiscal_year: fy,
    horizon_base_fy: horizonBaseFy,
    business_plan_status: businessPlanStatus,
    business_plan_revenue_yen: businessPlanRevenue,
    business_plan_operating_profit_yen: businessPlanOp,
    business_plan_investment_yen: businessPlanInvestment,
    revenue_plan_yen: revenuePlanYen,
    expense_plan_yen: expensePlanYen,
    profit_plan_operating_yen: profitOp,
    profit_plan_sga_yen: profitSga,
    period_from: periodFrom,
    period_to: periodTo,
    revenue_lines: revenueLines,
    expense_lines: expenseLines,
    revenue_units: revenueUnits,
    expense_units: expenseUnits,
    sources,
    consistency: {
      revenue_matches_business_plan: revenueMatches,
      expense_matches_profit_sga: expenseMatchesSga,
    },
  };
}
