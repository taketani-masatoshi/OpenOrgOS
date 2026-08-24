import { z } from "zod";

const nonnegativeYen = z.number().int().nonnegative();

export const budgetAdjustmentPolicySchema = z.object({
  company_max_adjustment_pct: z.number().min(0).max(100).default(20),
  department_max_adjustment_pct: z.number().min(0).max(100).default(20),
  require_adjustment_reference: z.boolean().default(true),
  person_allocation_mode: z.literal("strict").default("strict"),
  /** Alert when actual spend exceeds envelope by this percent (ADR 0027). */
  variance_alert_pct: z.number().min(0).max(500).default(20),
});

export const budgetCategoryAllocationSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  allocation_yen: nonnegativeYen,
});

export const memberBudgetSchema = z
  .object({
    /** Org-chart node for a human. operator_id remains read-compatible for v1 data. */
    person_id: z.string().min(1).optional(),
    operator_id: z.string().min(1).optional(),
    allocation_yen: nonnegativeYen,
    committed_yen: nonnegativeYen.default(0),
    category_budgets: z.array(budgetCategoryAllocationSchema).default([]),
    allocated_by_operator_id: z.string().min(1),
    purpose: z.string().optional(),
  })
  .refine((member) => Boolean(member.person_id || member.operator_id), {
    message: "person_id or legacy operator_id is required",
  });

export const departmentBudgetSchema = z.object({
  org_unit_id: z.string().min(1),
  head_operator_id: z.string().min(1),
  allocation_yen: nonnegativeYen,
  direct_committed_yen: nonnegativeYen.default(0),
  category_budgets: z.array(budgetCategoryAllocationSchema).default([]),
  allocated_by_operator_id: z.string().min(1),
  approved_by_operator_id: z.string().min(1),
  member_budgets: z.array(memberBudgetSchema).default([]),
  notes: z.string().optional(),
});

export const budgetDelegationEventSchema = z.object({
  event_id: z.string().regex(/^BDE-\d{6}$/),
  action: z.enum([
    "company_budget_set",
    "department_allocated",
    "member_allocated",
    "member_committed",
    "company_category_set",
    "department_category_set",
    "person_category_set",
  ]),
  actor_operator_id: z.string().min(1),
  org_unit_id: z.string().optional(),
  target_operator_id: z.string().optional(),
  target_person_id: z.string().optional(),
  account_code: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  amount_yen: nonnegativeYen,
  reference: z.string().optional(),
  occurred_at: z.string().datetime(),
});

/**
 * Pending total-amount changes awaiting superior approval.
 * within_policy: 計画基準の調整幅内（通常の上長承認）
 * beyond_policy: 調整幅超過（取締役会イベント board_event_id 必須 · ADR 0027）
 */
export const budgetPendingChangeSchema = z
  .object({
    change_id: z.string().regex(/^BDC-\d{6}$/),
    approval_id: z.string().min(1),
    kind: z.enum(["company_total", "department_total"]),
    amount_yen: nonnegativeYen,
    org_unit_id: z.string().min(1).optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
    escalation: z
      .enum(["within_policy", "beyond_policy"])
      .default("within_policy"),
    /** Closed/archived meeting|governance company event — required when beyond_policy. */
    board_event_id: z.string().min(1).optional(),
    proposed_by_operator_id: z.string().min(1),
    proposed_at: z.string().datetime(),
    status: z.enum(["pending", "applied", "superseded"]).default("pending"),
  })
  .superRefine((change, ctx) => {
    if (change.escalation === "beyond_policy" && !change.board_event_id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "beyond_policy の予算変更には board_event_id（承認済み取締役会イベント）が必要です。",
        path: ["board_event_id"],
      });
    }
  });

export const budgetDelegationFileSchema = z
  .object({
    version: z.literal(1),
    fiscal_year: z.string().min(1),
    currency: z.literal("JPY"),
    company_budget_yen: nonnegativeYen,
    company_budget_approved_by_operator_id: z.string().min(1),
    adjustment_policy: budgetAdjustmentPolicySchema.default({
      company_max_adjustment_pct: 20,
      department_max_adjustment_pct: 20,
      require_adjustment_reference: true,
      person_allocation_mode: "strict",
      variance_alert_pct: 20,
    }),
    company_category_budgets: z
      .array(budgetCategoryAllocationSchema)
      .default([]),
    departments: z.array(departmentBudgetSchema).default([]),
    pending_changes: z.array(budgetPendingChangeSchema).default([]),
    events: z.array(budgetDelegationEventSchema).default([]),
  })
  .superRefine((file, ctx) => {
    const validateCategories = (
      categories: Array<{ account_code: string; allocation_yen: number }>,
      limit: number,
      path: Array<string | number>,
    ): Map<string, number> => {
      const result = new Map<string, number>();
      let total = 0;
      for (const [index, category] of categories.entries()) {
        if (result.has(category.account_code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `費目 ${category.account_code} が重複しています。`,
            path: [...path, index, "account_code"],
          });
        }
        result.set(category.account_code, category.allocation_yen);
        total += category.allocation_yen;
      }
      if (total > limit) {
        const over = total - limit;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `費目予算の合計が枠を超えています` +
            `（費目合計 ${total.toLocaleString("ja-JP")}円` +
            ` · 枠 ${limit.toLocaleString("ja-JP")}円` +
            ` · 超過 ${over.toLocaleString("ja-JP")}円）。` +
            `費目を増やすときは他の費目を減らすか、先に総額枠を増やしてください。`,
          path,
        });
      }
      return result;
    };

    const companyCategories = validateCategories(
      file.company_category_budgets,
      file.company_budget_yen,
      ["company_category_budgets"],
    );
    const departmentCategoryTotals = new Map<string, number>();
    const departmentIds = new Set<string>();
    let departmentTotal = 0;
    for (const [departmentIndex, department] of file.departments.entries()) {
      if (departmentIds.has(department.org_unit_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `部門 ${department.org_unit_id} が重複しています。`,
          path: ["departments", departmentIndex, "org_unit_id"],
        });
      }
      departmentIds.add(department.org_unit_id);
      departmentTotal += department.allocation_yen;
      const departmentCategories = validateCategories(
        department.category_budgets,
        department.allocation_yen,
        ["departments", departmentIndex, "category_budgets"],
      );
      for (const [accountCode, amount] of departmentCategories) {
        if (companyCategories.size && !companyCategories.has(accountCode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `部門の費目 ${accountCode} は全社費目予算にありません。先に全社側へ費目を配分してください。`,
            path: ["departments", departmentIndex, "category_budgets"],
          });
        }
        departmentCategoryTotals.set(
          accountCode,
          (departmentCategoryTotals.get(accountCode) ?? 0) + amount,
        );
      }

      const memberIds = new Set<string>();
      let memberTotal = 0;
      const memberCategoryTotals = new Map<string, number>();
      for (const [memberIndex, member] of department.member_budgets.entries()) {
        const memberId = member.person_id ?? member.operator_id!;
        if (memberIds.has(memberId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `構成員 ${memberId} が重複しています。`,
            path: [
              "departments",
              departmentIndex,
              "member_budgets",
              memberIndex,
              member.person_id ? "person_id" : "operator_id",
            ],
          });
        }
        memberIds.add(memberId);
        memberTotal += member.allocation_yen;
        const memberCategories = validateCategories(
          member.category_budgets,
          member.allocation_yen,
          [
            "departments",
            departmentIndex,
            "member_budgets",
            memberIndex,
            "category_budgets",
          ],
        );
        for (const [accountCode, amount] of memberCategories) {
          if (
            departmentCategories.size &&
            !departmentCategories.has(accountCode)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `個人の費目 ${accountCode} は部門費目予算にありません。先に部門側へ費目を配分してください。`,
              path: [
                "departments",
                departmentIndex,
                "member_budgets",
                memberIndex,
                "category_budgets",
              ],
            });
          }
          memberCategoryTotals.set(
            accountCode,
            (memberCategoryTotals.get(accountCode) ?? 0) + amount,
          );
        }
        if (member.committed_yen > member.allocation_yen) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `個人の執行済が配分額を超えています。`,
            path: [
              "departments",
              departmentIndex,
              "member_budgets",
              memberIndex,
              "committed_yen",
            ],
          });
        }
      }
      for (const [accountCode, amount] of memberCategoryTotals) {
        const limit = departmentCategories.get(accountCode);
        if (limit != null && amount > limit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `個人への配分合計が部門の費目 ${accountCode} を超えています。他の個人を減らすか、部門の当該費目を増やしてください。`,
            path: ["departments", departmentIndex, "member_budgets"],
          });
        }
      }
      if (
        memberTotal + department.direct_committed_yen >
        department.allocation_yen
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `個人配分と部門直執行の合計が部門予算を超えています。他の個人を減らすか、部門総額を増やしてください。`,
          path: ["departments", departmentIndex, "member_budgets"],
        });
      }
    }
    if (departmentTotal > file.company_budget_yen) {
      const over = departmentTotal - file.company_budget_yen;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `部門予算の合計が全社執行枠を超えています` +
          `（部門合計 ${departmentTotal.toLocaleString("ja-JP")}円` +
          ` · 全社枠 ${file.company_budget_yen.toLocaleString("ja-JP")}円` +
          ` · 超過 ${over.toLocaleString("ja-JP")}円）。` +
          `部門を増やすときは他部門を減らすか、先に全社執行枠を増やしてください。`,
        path: ["departments"],
      });
    }
    for (const [accountCode, amount] of departmentCategoryTotals) {
      const limit = companyCategories.get(accountCode);
      if (limit != null && amount > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `部門への配分合計が全社の費目 ${accountCode} を超えています。他部門を減らすか、全社の当該費目を増やしてください。`,
          path: ["departments"],
        });
      }
    }
  });

export type MemberBudget = z.output<typeof memberBudgetSchema>;
export type BudgetCategoryAllocation = z.output<
  typeof budgetCategoryAllocationSchema
>;
export type DepartmentBudget = z.output<typeof departmentBudgetSchema>;
export type BudgetDelegationEvent = z.output<
  typeof budgetDelegationEventSchema
>;
export type BudgetPendingChange = z.output<typeof budgetPendingChangeSchema>;
export type BudgetDelegationFile = z.output<typeof budgetDelegationFileSchema>;
