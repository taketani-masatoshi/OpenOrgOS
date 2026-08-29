import { existsSync } from "node:fs";
import { join } from "node:path";
import { runValidateReport } from "../../commands/validate.js";
import { readYamlFile } from "../utils.js";
import { loadOperatorRegistry } from "../org/operators.js";
import { loadJournalEntries } from "../finance/expense-claim-journal.js";
import { buildElectronicLedgerComplianceReport } from "../finance/ledger/electronic-ledger.js";
import { getDataDir } from "../utils.js";
import { getTenantDir } from "../tenant.js";
import { companySchema } from "../../../schemas/company.js";

export type OnboardingStep = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
};

export type OnboardingReport = {
  complete: boolean;
  /** Customer-facing gate: company setup + first journal. */
  customer_ready: boolean;
  completed_count: number;
  total_count: number;
  steps: OnboardingStep[];
  company_name?: string;
  representative?: string;
  fiscal_year_end_month?: number;
};

export function isCompanySetupComplete(): boolean {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return false;
  try {
    const company = readYamlFile(path, companySchema);
    const name = company.name?.trim() ?? "";
    return name.length > 0 && name !== "株式会社未設定";
  } catch {
    return false;
  }
}

export function buildOnboardingReport(): OnboardingReport {
  const steps: OnboardingStep[] = [];

  const openingPath = join(getDataDir(), "finance/opening-balances.yaml");
  steps.push({
    id: "opening",
    label: "期首残高",
    complete: existsSync(openingPath),
    detail: existsSync(openingPath) ? "opening-balances.yaml" : "未設定",
  });

  const registry = loadOperatorRegistry();
  const ceo = registry?.operators.find((op) => op.role === "ceo");
  steps.push({
    id: "ceo",
    label: "CEO オペレーター",
    complete: Boolean(ceo),
    detail: ceo?.operator_id,
  });

  const ceoPasskey = Boolean(ceo?.webauthn_credential_ids?.length);
  steps.push({
    id: "passkey",
    label: "CEO Passkey 登録",
    complete: ceoPasskey,
  });

  const companyOk = isCompanySetupComplete();
  let companyName: string | undefined;
  let representative: string | undefined;
  let fiscalYearEndMonth: number | undefined;
  try {
    const path = join(getDataDir(), "company.yaml");
    if (existsSync(path)) {
      const company = readYamlFile(path, companySchema);
      companyName = company.name?.trim() || undefined;
      representative = company.representative?.trim() || undefined;
      fiscalYearEndMonth = company.fiscal_year_end_month;
    }
  } catch {
    /* ignore */
  }
  steps.push({
    id: "company",
    label: "会社情報",
    complete: companyOk,
    detail: companyOk ? "company.yaml" : "未設定",
  });

  const journalCount = loadJournalEntries().entries.length;
  const firstJe = journalCount > 0;
  steps.push({
    id: "first-je",
    label: "初回仕訳",
    complete: firstJe,
    detail: `${journalCount} 件`,
  });

  const validate = runValidateReport({ warnings: true });
  steps.push({
    id: "validate",
    label: "データ validate",
    complete: validate.ok,
    detail: validate.ok ? "OK" : `${validate.error_count} errors`,
  });

  const dencho = buildElectronicLedgerComplianceReport();
  const denchoOk = dencho.issues.length === 0 && dencho.append_only_ok;
  steps.push({
    id: "dencho",
    label: "電子帳簿チェック",
    complete: denchoOk,
    detail: denchoOk ? "OK" : `${dencho.issues.length} issues`,
  });

  const productMeta = join(getDataDir(), "product/subscription.yaml");
  steps.push({
    id: "subscription",
    label: "サブスクリプション",
    complete: existsSync(productMeta),
  });

  const tenantYaml = join(getTenantDir(), "tenant.yaml");
  steps.push({
    id: "tenant",
    label: "テナント正本",
    complete: existsSync(tenantYaml),
  });

  steps.push({
    id: "customer-ready",
    label: "顧客利用準備",
    complete: companyOk && firstJe,
    detail: companyOk && firstJe ? "OK" : "会社情報と初回仕訳が必要",
  });

  const completed = steps.filter((step) => step.complete).length;
  return {
    complete: completed === steps.length,
    customer_ready: companyOk && firstJe,
    completed_count: completed,
    total_count: steps.length,
    steps,
    company_name: companyName,
    representative,
    fiscal_year_end_month: fiscalYearEndMonth,
  };
}
