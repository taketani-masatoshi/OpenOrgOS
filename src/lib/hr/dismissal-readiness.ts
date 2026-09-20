import {
  dismissalReadinessLedgerSchema,
  type DismissalReadinessAction,
  type DismissalReadinessChecklist,
  type DismissalReadinessItem,
  type DismissalReadinessLedger,
  type DismissalReadinessResult,
} from "../../../schemas/talent-hiring.js";

const FORBIDDEN_KEYS = ["age", "gender", "birth_date", "employee_id", "candidate_id"] as const;

const REQUIRED_ITEMS: Array<{
  id: keyof DismissalReadinessLedger;
  purpose: string;
  defaultRef: string;
}> = [
  {
    id: "work_rules_ref",
    purpose: "就業規則または個別契約の参照を置く",
    defaultRef: "docs/company/hr/work-rules.md",
  },
  {
    id: "dismissal_ground_refs",
    purpose: "解雇事由の条文参照 ID を置く（本文は書かない）",
    defaultRef: "docs/company/hr/dismissal-grounds.md",
  },
  {
    id: "notice_procedure",
    purpose: "30日予告か予告手当かを手続き名だけ決める",
    defaultRef: "docs/company/hr/notice-procedure.md",
  },
  {
    id: "labor_condition_notice_template_ref",
    purpose: "労働条件通知のテンプレ参照を置く",
    defaultRef: "docs/company/hr/labor-condition-notice.md",
  },
  {
    id: "guidance_process_ref",
    purpose: "指導・改善の手続き参照を置く",
    defaultRef: "docs/company/hr/guidance-process.md",
  },
  {
    id: "fact_record_policy_ref",
    purpose: "事実記録の方針参照を置く（対象者決定前の記録方法）",
    defaultRef: "docs/company/hr/fact-record-policy.md",
  },
];

const OPTIONAL_ITEMS: Array<{
  id: keyof DismissalReadinessLedger;
  purpose: string;
  defaultRef: string;
}> = [
  {
    id: "probation_policy_ref",
    purpose: "試用期間の方針参照を置く（試用なしなら省略可）",
    defaultRef: "docs/company/hr/probation-policy.md",
  },
];

function forbiddenKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isPresent(ledger: DismissalReadinessLedger, id: keyof DismissalReadinessLedger): boolean {
  const value = ledger[id];
  if (id === "dismissal_ground_refs") {
    return Array.isArray(value) && value.length > 0;
  }
  if (id === "notice_procedure") return value === "thirty_day_notice" || value === "notice_allowance";
  return typeof value === "string" && value.length > 0;
}

export function evaluateDismissalReadiness(input: unknown): DismissalReadinessResult {
  const forbidden = forbiddenKeys(input);
  if (forbidden.length > 0) {
    return {
      status: "rejected",
      reason: `対象者や年齢・性別は含めない（${forbidden.join(", ")}）`,
    };
  }

  const parsed = dismissalReadinessLedgerSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { status: "rejected", reason: "解雇準備台帳を読めません" };
  }

  const ledger = parsed.data;
  const items: DismissalReadinessItem[] = [
    ...REQUIRED_ITEMS.map((item) => ({
      id: item.id,
      present: isPresent(ledger, item.id),
      required: true,
    })),
    ...OPTIONAL_ITEMS.map((item) => ({
      id: item.id,
      present: isPresent(ledger, item.id),
      required: false,
    })),
  ];

  const required = items.filter((item) => item.required);
  const presentRequired = required.filter((item) => item.present);
  const missing = required.filter((item) => !item.present).map((item) => item.id);
  const score = required.length === 0 ? 0 : Math.round((presentRequired.length / required.length) * 100);
  const documents_present = missing.length === 0;

  return {
    status: "ready",
    score,
    documents_present,
    verdict: documents_present ? "documents_present" : "not_ready",
    items,
    missing,
    notes: [
      "これは会社単位の書類準備の評価であり、解雇対象者の決定ではない。",
      "書類の充足は、解雇の適法性を保証しない。",
      "解雇・懲戒の最終判断は人間が行う。",
    ],
  };
}

export function prepareDismissalReadinessChecklist(input: unknown): DismissalReadinessChecklist {
  const evaluation = evaluateDismissalReadiness(input);
  if (evaluation.status === "rejected") {
    return {
      actions: [],
      notes: [evaluation.reason],
    };
  }

  const ledger =
    dismissalReadinessLedgerSchema.safeParse(input ?? {}).success
      ? dismissalReadinessLedgerSchema.parse(input ?? {})
      : {};

  const catalog = [...REQUIRED_ITEMS, ...OPTIONAL_ITEMS];
  const actions: DismissalReadinessAction[] = catalog
    .filter((item) => !isPresent(ledger, item.id))
    .map((item) => ({
      id: item.id,
      ref: item.defaultRef,
      purpose: item.purpose,
    }));

  return {
    actions,
    notes: [
      "不足参照の置き場所だけを示す。解雇通知や予告手当の本文は書かない。",
      "対象者が決まる前に会社側の書類を揃えるためのチェックリストである。",
    ],
  };
}
