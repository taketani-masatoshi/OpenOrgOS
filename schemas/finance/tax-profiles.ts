import { z } from "zod";
import { dateString, monthString } from "../common.js";
export const taxProfileEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  corporate_number: z.string().optional(),
  address: z.string().optional(),
});

export const taxProfileFiscalYearSchema = z.object({
  end_month: z.number().int().min(1).max(12),
  label: z.string().optional(),
  period_from: dateString.optional(),
  period_to: dateString.optional(),
  calendar_note: z.string().optional(),
});

export const taxProfileConsumptionTaxSchema = z.object({
  status: z.union([z.literal("TBD"), z.string()]),
  /** 本則 / 簡易。未設定は本則扱い。 */
  method: z.enum(["standard", "simplified"]).optional(),
  /** 簡易課税のみなし仕入率（%）。simplified の calc に必須。 */
  deemed_purchase_rate_pct: z
    .union([
      z.literal(40),
      z.literal(50),
      z.literal(60),
      z.literal(70),
      z.literal(80),
      z.literal(90),
    ])
    .optional(),
  options: z.array(z.string()).optional(),
  invoice_registration_number: z.string().optional(),
  invoice_registered: z.boolean().optional(),
  /** 免税判定の閾値（原則 10,000,000）。 */
  base_period_sales_threshold: z.number().nonnegative().optional(),
  /**
   * 基準期間（原則2期前）の課税売上高。免税/課税の機械検証に必須。
   * 当期売上計画とは別物 — 混同しないこと。
   */
  base_period_sales_jpy: z.number().nonnegative().optional(),
  /** 基準期間のラベル（例: 第7期 / FY2024）。 */
  base_period_fy: z.string().optional(),
  /**
   * 基準期間売上の独立正本パス（例: data/plans/profit-plan.yaml）。
   * tax-profile の数値はここからのキャッシュ — 循環参照禁止。
   */
  base_period_source_path: z.string().optional(),
  /** 独立正本の種別。 */
  base_period_source_kind: z
    .enum(["profit_plan_closed", "monthly_sum", "return_extract"])
    .optional(),
  /** 基準期間売上の証憑（決算書・総勘定元帳抜粋等の L1 パス）。 */
  base_period_evidence_path: z.string().optional(),
  /**
   * インボイス登録済みかつ免税の整合根拠（税理士確認メモ等のパス）。
   * 未設定で invoice_registered=true + 免税 のとき warning。
   */
  invoice_exempt_reconciled_basis: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileCorporateTaxSchema = z.object({
  category: z.string().optional(),
  applicable_rates: z.record(z.string()).optional(),
  capital_stock: z.union([z.literal("TBD"), z.number().nonnegative()]).optional(),
  prior_retained_earnings: z.union([z.literal("TBD"), z.number()]).optional(),
  estimated_tax_fy2026: z.number().nonnegative().optional(),
  estimated_tax_status: z.string().optional(),
  /** Top marginal rate (%) used to sanity-check estimate vs actual income. Default 15 (中小法人 800万以下). */
  estimated_tax_top_rate_pct: z.number().positive().max(100).optional(),
  /**
   * 税理士算定書等のパス。パスがあるだけでは数値矛盾を消さない。
   * 矛盾解消には見積を帳簿と整合させる（損失なら 0）か、見積が含意する所得を
   * 実績/計画が支持している必要がある。
   */
  estimated_tax_basis: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileFilingCalendarItemSchema = z.object({
  id: z.string().min(1),
  tax: z.string().min(1),
  authority: z.string().optional(),
  deadline: dateString.optional(),
  status: z.union([z.literal("TBD"), z.string()]).optional(),
  attachments: z.array(z.string()).optional(),
  note: z.string().optional(),
});

/** Rough estimate for CEO cash visibility (not tax-advisor precise). */
export const obligationAmountSchema = z.object({
  mode: z.enum(["fixed", "formula", "from_ledger", "from_profile"]),
  fixed_jpy: z.number().nonnegative().optional(),
  formula: z
    .enum([
      "payroll_withholding_rough",
      "payroll_social_employer_rough",
      "fixed_asset_quarter",
      "consumption_refund_open",
    ])
    .optional(),
  /** Dot path under tax-profile, e.g. corporate_tax.estimated_tax_fy2026 */
  from_profile_path: z.string().optional(),
  note: z.string().optional(),
});

export const obligationRhythmSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["tax", "social", "hr"]),
  label: z.string().min(1),
  cadence: z.enum(["month", "quarter", "semi", "annual", "custom"]),
  due_rule: z.enum([
    "next_month_day_10",
    "end_of_month",
    "fiscal_plus_2_months",
    "fixed_md",
    "custom_mds",
  ]),
  /** For fixed_md / with day override on monthly rules. */
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  /** Recurring month-day pairs (e.g. property tax 4 installments). */
  custom_mds: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
      })
    )
    .optional(),
  enabled: z.boolean().default(true),
  apply_when: z
    .enum([
      "always",
      "has_employees",
      "has_withholding",
      "has_social_insurance",
      "consumption_taxable",
      "has_fixed_assets",
      "has_open_consumption_refund",
    ])
    .default("always"),
  amount: obligationAmountSchema.optional(),
  /** Hook for future cashflow merge. */
  cashflow_category: z.string().optional(),
  authority: z.string().optional(),
  status_default: z.string().optional(),
  note: z.string().optional(),
});

export const taxProfileSchema = z.object({
  entity: taxProfileEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  consumption_tax: taxProfileConsumptionTaxSchema,
  corporate_tax: taxProfileCorporateTaxSchema,
  local_tax: z
    .object({
      prefecture: z.string().optional(),
      municipalities: z
        .array(
          z.object({
            name: z.string(),
            assets: z.array(z.string()).optional(),
            taxes: z.array(z.string()).optional(),
          })
        )
        .optional(),
      notes: z.string().optional(),
      /** Annual property tax estimate for quarter split (demo). */
      fixed_asset_tax_annual_jpy: z.number().nonnegative().optional(),
    })
    .optional(),
  /** Legacy point-in-time list; prefer obligation_rhythms when present. */
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  /** Cadence → expanded dates + rough amounts for CEO calendar. */
  obligation_rhythms: z.array(obligationRhythmSchema).default([]),
  /**
   * Per-occurrence status overrides (e.g. notice_pending · paid).
   * Applied after rhythm expansion — excludes from actionable overdue when deferred.
   */
  obligation_status_overrides: z
    .array(
      z.object({
        rhythm_id: z.string().min(1),
        deadline: dateString.optional(),
        /** Payroll / period month YYYY-MM (monthly rhythms). */
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        status: z.string().min(1),
        note: z.string().optional(),
      })
    )
    .default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
  demo_confirmed_at: dateString.optional(),
  demo_note: z.string().optional(),
});

export const taxProfileUsFederalSchema = z.object({
  corporate_rate: z.string().optional(),
  estimated_payments: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileUsStateSchema = z.object({
  state_of_incorporation: z.string().optional(),
  franchise_tax: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileUsEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  ein: z.string().optional(),
  state_of_incorporation: z.string().optional(),
  registered_office: z.string().optional(),
});

export const taxProfileUsSchema = z.object({
  entity: taxProfileUsEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  federal_tax: taxProfileUsFederalSchema,
  state_tax: taxProfileUsStateSchema,
  sales_tax: z
    .object({
      nexus_states: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const taxProfileCorporateEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  registration_id: z.string().optional(),
  registered_office: z.string().optional(),
});

export const taxProfileCorporateSchema = z.object({
  entity: taxProfileCorporateEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  corporate_tax: z
    .object({
      headline_rate: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  indirect_tax: z
    .object({
      type: z.string().optional(),
      rate: z.string().optional(),
      registration_id: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
