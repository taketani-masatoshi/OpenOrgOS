/**
 * Ensure chart-of-accounts has journal_source_accounts + demo seed accounts.
 * Used by seed-demo-year and first-journal fallback (no hardcoded orphan codes).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { chartOfAccountsSchema } from "../../../schemas/finance/chart-of-accounts.js";
import type { ChartOfAccounts } from "../../../schemas/finance/types.js";
import { getDataDir } from "../utils.js";
import { loadChartOfAccounts } from "../data.js";

const DEMO_ACCOUNTS: Array<Record<string, unknown>> = [
  {
    code: "1100",
    name: "現金及び預金",
    type: "asset",
    normal_balance: "debit",
  },
  {
    code: "1150",
    name: "売掛金",
    type: "asset",
    normal_balance: "debit",
  },
  {
    code: "1290",
    name: "減価償却累計額",
    type: "asset_contra",
    normal_balance: "credit",
  },
  {
    code: "2110",
    name: "買掛金",
    type: "liability",
    normal_balance: "credit",
  },
  {
    code: "2120",
    name: "預り金-源泉所得税",
    type: "liability",
    normal_balance: "credit",
  },
  {
    code: "2130",
    name: "預り金-社会保険料",
    type: "liability",
    normal_balance: "credit",
  },
  {
    code: "2140",
    name: "未払給与",
    type: "liability",
    normal_balance: "credit",
  },
  {
    code: "2160",
    name: "仮受消費税",
    type: "liability",
    normal_balance: "credit",
  },
  {
    code: "2170",
    name: "仮払消費税",
    type: "asset",
    normal_balance: "debit",
  },
  {
    code: "3200",
    name: "繰越利益剰余金",
    type: "equity",
    normal_balance: "credit",
  },
  {
    code: "4100",
    name: "売上高",
    type: "revenue",
    normal_balance: "credit",
    statement_section: "revenue",
  },
  {
    code: "5100",
    name: "販売費及び一般管理費",
    type: "expense",
    normal_balance: "debit",
    statement_section: "sga",
  },
  {
    code: "5300",
    name: "役員報酬",
    type: "expense",
    normal_balance: "debit",
    statement_section: "sga",
  },
];

const DEFAULT_JOURNAL_SOURCE = {
  bank_control: "1100",
  accounts_receivable: "1150",
  accounts_payable: "2110",
  withholding_payable: "2120",
  social_insurance_payable: "2130",
  payroll_payable: "2140",
  payroll_expense: "5300",
  depreciation_expense: "5100",
  accumulated_depreciation: "1290",
  retained_earnings: "3200",
  consumption_tax_payable: "2160",
  consumption_tax_receivable: "2170",
};

function coaPath(): string {
  return join(getDataDir(), "finance", "chart-of-accounts.yaml");
}

function taxProfilePath(): string {
  return join(getDataDir(), "finance", "tax-profile.yaml");
}

export type DemoYearAccountCodes = {
  accounts_receivable: string;
  revenue: string;
  expense: string;
  accounts_payable: string;
  bank_control: string;
};

/** Clear TBD consumption-tax status so posted journals can validate. */
export function ensureLedgerDemoTaxProfile(): void {
  const path = taxProfilePath();
  if (!existsSync(path)) return;
  const raw = YAML.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const ct = (raw.consumption_tax ?? {}) as Record<string, unknown>;
  if (String(ct.status ?? "TBD") === "TBD") {
    ct.status = "免税事業者";
    ct.invoice_registered = false;
    ct.base_period_sales_jpy = ct.base_period_sales_jpy ?? 0;
    raw.consumption_tax = ct;
  }
  const corp = (raw.corporate_tax ?? {}) as Record<string, unknown>;
  if (corp.category === "TBD" || corp.category == null) {
    corp.category = "普通法人";
  }
  if (corp.capital_stock === "TBD" || corp.capital_stock == null) {
    corp.capital_stock = 1_000_000;
  }
  raw.corporate_tax = corp;
  writeFileSync(path, YAML.stringify(raw), "utf-8");
}

/** Merge missing demo accounts + journal_source_accounts into tenant COA. */
export function ensureLedgerDemoChartOfAccounts(): ChartOfAccounts {
  ensureLedgerDemoTaxProfile();
  const path = coaPath();
  const raw = existsSync(path)
    ? YAML.parse(readFileSync(path, "utf-8"))
    : {
        version: "1",
        currency: "JPY",
        accounts: [],
        category_mapping: { revenue: {}, expense: {} },
      };

  const codes = new Set(
    (Array.isArray(raw.accounts) ? raw.accounts : []).map(
      (row: { code?: string }) => row.code,
    ),
  );
  for (const account of DEMO_ACCOUNTS) {
    if (!codes.has(account.code as string)) {
      raw.accounts = [...(raw.accounts ?? []), account];
      codes.add(account.code as string);
    }
  }

  if (!raw.journal_source_accounts) {
    raw.journal_source_accounts = { ...DEFAULT_JOURNAL_SOURCE };
  } else {
    raw.journal_source_accounts = {
      ...DEFAULT_JOURNAL_SOURCE,
      ...raw.journal_source_accounts,
    };
  }

  if (!raw.category_mapping) {
    raw.category_mapping = { revenue: {}, expense: {} };
  }
  if (!raw.category_mapping.revenue?.rent) {
    raw.category_mapping.revenue = {
      ...raw.category_mapping.revenue,
      rent: "4100",
      other_revenue: "4100",
    };
  }
  if (!raw.category_mapping.expense?.other) {
    raw.category_mapping.expense = {
      ...raw.category_mapping.expense,
      other: "5100",
      depreciation: "5100",
    };
  }

  const parsed = chartOfAccountsSchema.parse(raw);
  writeFileSync(path, YAML.stringify(parsed), "utf-8");
  return parsed;
}

/** Resolve demo seed account codes from COA (never invent orphan codes). */
export function resolveDemoYearAccountCodes(
  coa: ChartOfAccounts = loadChartOfAccounts(),
): DemoYearAccountCodes {
  const mapping = coa.journal_source_accounts;
  if (!mapping) {
    throw new Error(
      "chart-of-accounts.yaml missing journal_source_accounts — run ensureLedgerDemoChartOfAccounts first",
    );
  }
  const revenue =
    coa.category_mapping?.revenue?.rent ??
    coa.category_mapping?.revenue?.other_revenue ??
    coa.accounts.find((a) => a.type === "revenue")?.code;
  const expense =
    mapping.depreciation_expense ??
    coa.category_mapping?.expense?.other ??
    coa.accounts.find((a) => a.type === "expense")?.code;
  const accountsPayable =
    mapping.accounts_payable ??
    coa.accounts.find((a) => a.code === "2110")?.code;
  if (!revenue || !expense || !accountsPayable) {
    throw new Error(
      "COA lacks revenue/expense/AP accounts for demo seed — ensureLedgerDemoChartOfAccounts first",
    );
  }
  return {
    accounts_receivable: mapping.accounts_receivable,
    revenue,
    expense,
    accounts_payable: accountsPayable,
    bank_control: mapping.bank_control,
  };
}
