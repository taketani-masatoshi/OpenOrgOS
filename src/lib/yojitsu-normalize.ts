import {
  yojitsuLegacyMonthPlan,
  yojitsuMonthSideSchema,
  type YojitsuLine,
  type YojitsuLineKind,
  type YojitsuMonth,
  type YojitsuMonthSide,
  type YojitsuPlan,
  type YojitsuPlanRaw,
} from "../../schemas/finance.js";
import { loadLegacyYojitsuFieldMap } from "./yojitsu-legacy-adapter.js";

export function isLegacyYojitsuSide(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  if ("lines" in raw && Array.isArray((raw as { lines?: unknown }).lines)) {
    return false;
  }
  const map = loadLegacyYojitsuFieldMap();
  const keys = Object.keys(raw as object);
  return keys.some((k) => k in map);
}

export function normalizeYojitsuSide(raw: unknown): YojitsuMonthSide {
  if (!raw || typeof raw !== "object") {
    return { lines: [] };
  }
  if ("lines" in raw && Array.isArray((raw as { lines?: unknown }).lines)) {
    return yojitsuMonthSideSchema.parse(raw);
  }
  if (isLegacyYojitsuSide(raw)) {
    const legacy = yojitsuLegacyMonthPlan.parse(raw);
    const fieldMap = loadLegacyYojitsuFieldMap();
    const lines: YojitsuLine[] = [];
    for (const [field, amount] of Object.entries(legacy)) {
      if (typeof amount !== "number" || amount === 0) continue;
      const map = fieldMap[field];
      if (!map) continue;
      lines.push({
        segment: map.segment,
        kind: map.kind,
        amount,
        label: map.label,
      });
    }
    return { lines };
  }
  return { lines: [] };
}

export function normalizeYojitsuMonth(raw: {
  month: string;
  plan: unknown;
  actual?: unknown;
  notes?: string;
}): YojitsuMonth {
  return {
    month: raw.month,
    plan: normalizeYojitsuSide(raw.plan),
    actual: raw.actual != null ? normalizeYojitsuSide(raw.actual) : undefined,
    notes: raw.notes,
  };
}

export function normalizeYojitsuPlan(raw: YojitsuPlanRaw): YojitsuPlan {
  return {
    ...raw,
    months: raw.months.map(normalizeYojitsuMonth),
  };
}

export function lineDisplayLabel(line: YojitsuLine): string {
  if (line.label) return line.label;
  if (line.segment.startsWith("_")) {
    return line.kind === "capex" ? "設備投資" : line.segment.slice(1);
  }
  return line.segment;
}

export function sumLines(
  side: YojitsuMonthSide,
  kind?: YojitsuLineKind | YojitsuLineKind[]
): number {
  const kinds = kind == null ? undefined : Array.isArray(kind) ? kind : [kind];
  return side.lines.reduce((sum, line) => {
    if (kinds && !kinds.includes(line.kind)) return sum;
    return sum + line.amount;
  }, 0);
}

export function sumRevenue(side: YojitsuMonthSide): number {
  return sumLines(side, "revenue");
}

export function sumOperatingExpenses(side: YojitsuMonthSide): number {
  return sumLines(side, ["expense", "depreciation"]);
}

export function sumAllOutflows(side: YojitsuMonthSide): number {
  return sumLines(side, ["expense", "depreciation", "capex"]);
}

export function aggregateBySegment(
  plan: YojitsuPlan,
  kind: YojitsuLineKind,
  useActual = true
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const month of plan.months) {
    const side = (useActual && month.actual ? month.actual : month.plan) ?? month.plan;
    for (const line of side.lines) {
      if (line.kind !== kind) continue;
      const key = lineDisplayLabel(line);
      totals.set(key, (totals.get(key) ?? 0) + line.amount);
    }
  }
  return totals;
}

export function resolveYojitsuMonthSide(
  month: YojitsuMonth,
  preferActual = true
): YojitsuMonthSide {
  if (preferActual && month.actual?.lines.length) {
    return month.actual;
  }
  return month.plan;
}

export function serializeYojitsuSideV2(side: YojitsuMonthSide): { lines: YojitsuLine[] } {
  return {
    lines: side.lines.map((line) => ({
      segment: line.segment,
      kind: line.kind,
      amount: line.amount,
      ...(line.label ? { label: line.label } : {}),
    })),
  };
}

export function serializeYojitsuPlanV2(plan: YojitsuPlan): Record<string, unknown> {
  return {
    schema_version: 2,
    year: plan.year,
    fiscal_year: plan.fiscal_year,
    period_from: plan.period_from,
    period_to: plan.period_to,
    assumptions: plan.assumptions,
    closing: plan.closing,
    summary: plan.summary,
    months: plan.months.map((m) => ({
      month: m.month,
      plan: serializeYojitsuSideV2(m.plan),
      ...(m.actual ? { actual: serializeYojitsuSideV2(m.actual) } : {}),
      ...(m.notes ? { notes: m.notes } : {}),
    })),
  };
}
