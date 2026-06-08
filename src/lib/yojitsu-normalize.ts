import {
  yojitsuLineSchema,
  yojitsuLegacyMonthPlan,
  yojitsuMonthSideSchema,
  type YojitsuLine,
  type YojitsuLineKind,
  type YojitsuMonth,
  type YojitsuMonthSide,
  type YojitsuPlan,
  type YojitsuPlanRaw,
} from "../../schemas/finance.js";

/** v1 固定列 → business-plan segments 名（MAL 互換） */
export const LEGACY_YOJITSU_FIELD_MAP: Record<
  string,
  { segment: string; kind: YojitsuLineKind; label?: string }
> = {
  revenue_bancho: { segment: "番町ハイム312（賃貸）", kind: "revenue" },
  revenue_kamezawa: { segment: "亀沢旅館（1棟貸し）", kind: "revenue" },
  revenue_translation: { segment: "翻訳・通訳（不動産）", kind: "revenue" },
  revenue_services: { segment: "DX・ソフトウェア", kind: "revenue" },
  expense_bancho: { segment: "番町ハイム312（賃貸）", kind: "expense" },
  expense_kamezawa: { segment: "亀沢旅館（1棟貸し）", kind: "expense" },
  expense_officer: { segment: "_corporate", kind: "expense", label: "役員報酬" },
  expense_company: { segment: "_corporate", kind: "expense", label: "本社固定費" },
  depreciation: {
    segment: "番町ハイム312（賃貸）",
    kind: "depreciation",
    label: "減価償却費",
  },
  capex: { segment: "_investment", kind: "capex", label: "設備投資" },
};

export function isLegacyYojitsuSide(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  if ("lines" in raw && Array.isArray((raw as { lines?: unknown }).lines)) {
    return false;
  }
  const keys = Object.keys(raw as object);
  return keys.some((k) => k in LEGACY_YOJITSU_FIELD_MAP);
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
    const lines: YojitsuLine[] = [];
    for (const [field, amount] of Object.entries(legacy)) {
      if (typeof amount !== "number" || amount === 0) continue;
      const map = LEGACY_YOJITSU_FIELD_MAP[field];
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
