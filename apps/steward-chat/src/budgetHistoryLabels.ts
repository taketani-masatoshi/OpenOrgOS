/** Budget history copy — Japanese when the UI locale is ja*. */

export type BudgetHistoryEvent = {
  action: string;
  actor_operator_id: string;
  org_unit_id?: string;
  target_operator_id?: string;
  target_person_id?: string;
  account_code?: string;
  amount_yen: number;
  reference?: string;
};

export type BudgetHistoryLookup = {
  orgUnitLabel?: (orgUnitId: string) => string | undefined;
  personLabel?: (personId: string) => string | undefined;
  /** Resolve operator registry display names (L1). */
  operatorLabel?: (operatorId: string) => string | undefined;
  accountLabel?: (accountCode: string) => string | undefined;
  formatYen: (amount: number) => string;
};

const ACTION_JA: Record<string, string> = {
  company_budget_set: "全社予算枠を設定",
  department_allocated: "部門予算枠を分配",
  member_allocated: "個人予算枠を分配",
  member_committed: "個人執行を予約",
  company_category_set: "全社費目枠を設定",
  department_category_set: "部門費目枠を設定",
  person_category_set: "個人費目枠を設定",
};

const ACTION_EN: Record<string, string> = {
  company_budget_set: "Company envelope set",
  department_allocated: "Department envelope allocated",
  member_allocated: "Personal envelope allocated",
  member_committed: "Personal spend committed",
  company_category_set: "Company category set",
  department_category_set: "Department category set",
  person_category_set: "Personal category set",
};

/** Known event.reference slugs → Japanese reason labels (UI only; not L2). */
const REFERENCE_JA: Record<string, string> = {
  "admin-person-office-supplies-envelope": "総務・事務用品の個人枠",
  "admin-person-travel-envelope": "総務・旅費の個人枠",
  "admin-person-meeting-envelope": "総務・会議費の個人枠",
  "seed-admin-head-reimbursement-envelope": "管理本部長の精算枠（初期設定）",
  "align-expense-plan-FY2026-total": "経費計画FY2026合計への整合",
  "align-expense-plan-org-allocations": "経費計画の部門配分への整合",
  "seed-allocatable-from-expense-plan": "経費計画からの配分可能枠（初期設定）",
  "split-misc-after-person-coa-5720-5740": "個人費目設定後の雑費分割",
  "coa-person-travel-from-fixed-costs": "固定費からの旅費個人枠",
  "coa-person-meeting-from-fixed-costs": "固定費からの会議費個人枠",
  "coa-person-office-supplies-from-fixed-costs": "固定費からの事務用品個人枠",
};

const REFERENCE_EN: Record<string, string> = {
  "admin-person-office-supplies-envelope":
    "Admin office-supplies personal envelope",
  "admin-person-travel-envelope": "Admin travel personal envelope",
  "admin-person-meeting-envelope": "Admin meeting personal envelope",
  "seed-admin-head-reimbursement-envelope":
    "Admin head reimbursement envelope (seed)",
  "align-expense-plan-FY2026-total": "Align to expense-plan FY2026 total",
  "align-expense-plan-org-allocations": "Align to expense-plan org allocations",
  "seed-allocatable-from-expense-plan":
    "Allocatable from expense-plan (seed)",
  "split-misc-after-person-coa-5720-5740":
    "Split misc after person CoA 5720–5740",
  "coa-person-travel-from-fixed-costs": "Travel personal CoA from fixed costs",
  "coa-person-meeting-from-fixed-costs": "Meeting personal CoA from fixed costs",
  "coa-person-office-supplies-from-fixed-costs":
    "Office-supplies personal CoA from fixed costs",
};

/** Non-registry actor/target identities used in governance flows. */
const IDENTITY_JA: Record<string, string> = {
  secretary: "秘書",
  agent: "エージェント",
  system: "システム",
  steward: "スチュワード",
};

const IDENTITY_EN: Record<string, string> = {
  secretary: "Secretary",
  agent: "Agent",
  system: "System",
  steward: "Steward",
};

/** Prefer document lang, then navigator languages. */
export function prefersJapaneseLocale(
  langHint?: string | null,
  languages?: readonly string[],
): boolean {
  const candidates = [
    langHint,
    ...(languages ??
      (typeof navigator !== "undefined"
        ? navigator.languages?.length
          ? navigator.languages
          : [navigator.language]
        : [])),
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) return true;
  return candidates.some((value) => value.toLowerCase().startsWith("ja"));
}

export function budgetHistoryActionLabel(
  action: string,
  japanese: boolean,
): string {
  const map = japanese ? ACTION_JA : ACTION_EN;
  return map[action] ?? action.replaceAll("_", " ");
}

/** Map known reference slugs; otherwise lightly humanize kebab-case. */
export function budgetHistoryReferenceLabel(
  reference: string,
  japanese: boolean,
): string {
  const trimmed = reference.trim();
  if (!trimmed) return trimmed;
  const map = japanese ? REFERENCE_JA : REFERENCE_EN;
  if (map[trimmed]) return map[trimmed];
  return humanizeKebab(trimmed);
}

function humanizeKebab(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      if (/^[A-Z0-9]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function resolveOperatorLabel(
  operatorId: string,
  lookup: BudgetHistoryLookup,
  japanese: boolean,
): string {
  const fromRegistry = lookup.operatorLabel?.(operatorId);
  if (fromRegistry) return fromRegistry;
  const identityMap = japanese ? IDENTITY_JA : IDENTITY_EN;
  const key = operatorId.trim().toLowerCase();
  if (identityMap[key]) return identityMap[key];
  return operatorId;
}

function resolveOrg(
  event: BudgetHistoryEvent,
  lookup: BudgetHistoryLookup,
  japanese: boolean,
): string {
  if (!event.org_unit_id) return japanese ? "全社" : "Company";
  return (
    lookup.orgUnitLabel?.(event.org_unit_id) ??
    event.org_unit_id
  );
}

function resolveAccount(
  event: BudgetHistoryEvent,
  lookup: BudgetHistoryLookup,
): string | undefined {
  if (!event.account_code) return undefined;
  return lookup.accountLabel?.(event.account_code) ?? undefined;
}

function resolvePerson(
  event: BudgetHistoryEvent,
  lookup: BudgetHistoryLookup,
  japanese: boolean,
): string | undefined {
  if (event.target_person_id) {
    return (
      lookup.personLabel?.(event.target_person_id) ?? event.target_person_id
    );
  }
  if (event.target_operator_id) {
    return resolveOperatorLabel(event.target_operator_id, lookup, japanese);
  }
  return undefined;
}

/** Title + one-line detail for the history list. */
export function formatBudgetHistoryEvent(
  event: BudgetHistoryEvent,
  lookup: BudgetHistoryLookup,
  options?: { japanese?: boolean; langHint?: string | null },
): { title: string; detail: string } {
  const japanese =
    options?.japanese ??
    prefersJapaneseLocale(
      options?.langHint ??
        (typeof document !== "undefined" ? document.documentElement.lang : null),
    );

  const title = budgetHistoryActionLabel(event.action, japanese);
  const parts: string[] = [
    resolveOrg(event, lookup, japanese),
    lookup.formatYen(event.amount_yen),
  ];

  const account = resolveAccount(event, lookup);
  if (account) {
    parts.push(japanese ? `費目 ${account}` : `category ${account}`);
  }

  const person = resolvePerson(event, lookup, japanese);
  if (person) {
    parts.push(japanese ? `対象 ${person}` : `to ${person}`);
  }

  const actor = resolveOperatorLabel(
    event.actor_operator_id,
    lookup,
    japanese,
  );
  parts.push(japanese ? `実施 ${actor}` : `by ${actor}`);

  if (event.reference?.trim()) {
    const reason = budgetHistoryReferenceLabel(event.reference, japanese);
    parts.push(japanese ? `理由 ${reason}` : `ref ${reason}`);
  }

  return { title, detail: parts.join(" · ") };
}
