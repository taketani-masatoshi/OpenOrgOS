import { join } from "node:path";
import { validateModules } from "./modules.js";
import { validateLegacyRosterFiles } from "./tenant-roster-load.js";
import { getResolvedJurisdiction } from "./jurisdiction.js";
import { validateRegulations } from "./regulations.js";
import {
  companySchema,
  propertySchema,
  contractSchema,
  monthlyFinanceSchema,
  fixedCostsSchema,
  loansSchema,
  businessPlanSchema,
  propertyRevenuePlanSchema,
  yojitsuPlanSchema,
  payrollSchema,
  cashBalanceSchema,
  fixedAssetsSchema,
  taxProfileSchema,
  taxProfileUsSchema,
  taxProfileCorporateSchema,
  chartOfAccountsSchema,
  type CashBalance,
  type FixedAssets,
  type TaxProfile,
  type ChartOfAccounts,
  revenuePlanSchema,
  profitPlanSchema,
  expensePlanSchema,
  investmentPlanSchema,
  debtPlanSchema,
  facilityPublicSchema,
  employeesFileSchema,
  documentIoSchema,
  type Company,
  type Property,
  type Contract,
  type MonthlyFinance,
  type FixedCosts,
  type Loans,
  type BusinessPlan,
  type PropertyRevenuePlan,
  type FacilityPublic,
  type EmployeesFile,
  calendarFileSchema,
  tasksFileSchema,
  oneOnOnesFileSchema,
  externalContactsFileSchema,
  stakeholdersFileSchema,
  classificationRegistrySchema,
  fundsFileSchema,
  portfolioFileSchema,
  type CalendarFile,
  type TasksFile,
  type OneOnOnesFile,
  type ExternalContactsFile,
  type StakeholdersFile,
} from "../../schemas/index.js";
import { existsSync } from "node:fs";
import { loadEnabledModules } from "./modules.js";
import { loadSchedulingCases } from "./scheduling-coordination/store.js";
import { normalizeYojitsuPlan } from "./yojitsu-normalize.js";
import { getPrimaryOperationsPublicRel } from "./ops-config.js";
import { getDataDir, readYamlFile, listYamlFiles, getStakeholdersYaml, toLogicalPath, resolveTenantPath } from "./utils.js";

export interface StewardData {
  company: Company;
  properties: Property[];
  contracts: Contract[];
  monthlyFinances: MonthlyFinance[];
  fixedCosts: FixedCosts;
  loans: Loans;
  businessPlan: BusinessPlan;
  propertyRevenuePlan: PropertyRevenuePlan;
}

export interface ValidationError {
  file: string;
  message: string;
}

export function loadCompany(): Company {
  return readYamlFile(join(getDataDir(), "company.yaml"), companySchema);
}

export function loadProperties(): Property[] {
  return listYamlFiles(join(getDataDir(), "properties")).map((f) =>
    readYamlFile(f, propertySchema)
  );
}

export function loadProperty(id: string): Property | undefined {
  const path = join(getDataDir(), "properties", `${id}.yaml`);
  try {
    return readYamlFile(path, propertySchema);
  } catch {
    return undefined;
  }
}

export function loadContracts(): Contract[] {
  return listYamlFiles(join(getDataDir(), "contracts")).map((f) =>
    readYamlFile(f, contractSchema)
  );
}

export function loadContract(id: string): Contract | undefined {
  const path = join(getDataDir(), "contracts", `${id}.yaml`);
  try {
    return readYamlFile(path, contractSchema);
  } catch {
    return undefined;
  }
}

export function loadMonthlyFinances(): MonthlyFinance[] {
  return listYamlFiles(join(getDataDir(), "finance", "monthly"))
    .map((f) => readYamlFile(f, monthlyFinanceSchema))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function loadMonthlyFinance(month: string): MonthlyFinance | undefined {
  const path = join(getDataDir(), "finance", "monthly", `${month}.yaml`);
  try {
    return readYamlFile(path, monthlyFinanceSchema);
  } catch {
    return undefined;
  }
}

export function loadFixedCosts(): FixedCosts {
  return readYamlFile(join(getDataDir(), "finance", "fixed-costs.yaml"), fixedCostsSchema);
}

export function loadPayroll() {
  return readYamlFile(join(getDataDir(), "finance", "payroll.yaml"), payrollSchema);
}

export function loadCashBalance(): CashBalance | undefined {
  const path = join(getDataDir(), "finance", "cash-balance.yaml");
  try {
    return readYamlFile(path, cashBalanceSchema);
  } catch {
    return undefined;
  }
}

export function resolveCashBalanceTotal(balance: CashBalance): number | null {
  if (balance.total != null) return balance.total;
  const amounts = balance.accounts.map((a) => a.amount).filter((a): a is number => a != null);
  if (amounts.length === 0 || amounts.length < balance.accounts.length) return null;
  return amounts.reduce((s, a) => s + a, 0);
}

export function loadLoans(): Loans {
  return readYamlFile(join(getDataDir(), "finance", "loans.yaml"), loansSchema);
}

export function loadFixedAssets(): FixedAssets {
  return readYamlFile(join(getDataDir(), "finance", "fixed-assets.yaml"), fixedAssetsSchema);
}

export function loadTaxProfile():
  | TaxProfile
  | import("../../schemas/finance.js").TaxProfileUs
  | import("../../schemas/finance.js").TaxProfileCorporate {
  const path = join(getDataDir(), "finance", "tax-profile.yaml");
  const { pack } = getResolvedJurisdiction();
  switch (pack.tax_profile_schema) {
    case "us":
      return readYamlFile(path, taxProfileUsSchema);
    case "jp":
      return readYamlFile(path, taxProfileSchema);
    case "corporate":
      return readYamlFile(path, taxProfileCorporateSchema);
  }
}

export function loadChartOfAccounts(): ChartOfAccounts {
  return readYamlFile(
    join(getDataDir(), "finance", "chart-of-accounts.yaml"),
    chartOfAccountsSchema
  );
}

export interface FixedAssetConsistencyIssue {
  message: string;
}

export function validateFixedAssetConsistency(): FixedAssetConsistencyIssue[] {
  const issues: FixedAssetConsistencyIssue[] = [];
  const fixedAssets = loadFixedAssets();
  const expensePlan = loadExpensePlan();
  const properties = loadProperties();
  const loans = loadLoans();

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const loanById = new Map(loans.loans.map((l) => [l.id, l]));
  const assetIds = new Set(fixedAssets.assets.map((a) => a.id));

  for (const asset of fixedAssets.assets) {
    if (!propertyById.has(asset.property_id)) {
      issues.push({ message: `${asset.id}: property_id ${asset.property_id} not found` });
    }
    if (asset.loan_id && !loanById.has(asset.loan_id)) {
      issues.push({ message: `${asset.id}: loan_id ${asset.loan_id} not found` });
    }
    const expectedBook = asset.acquisition_cost - asset.accumulated_depreciation;
    if (asset.book_value !== expectedBook) {
      issues.push({
        message: `${asset.id}: book_value ${asset.book_value} ≠ acquisition_cost - accumulated (${expectedBook})`,
      });
    }
  }

  const loanAssetTotal = loans.loans.reduce((s, l) => s + l.balance, 0);
  if (fixedAssets.summary?.total_acquisition_cost != null) {
    if (fixedAssets.summary.total_acquisition_cost !== loanAssetTotal) {
      issues.push({
        message: `fixed-assets summary total_acquisition_cost (${fixedAssets.summary.total_acquisition_cost}) ≠ loans total balance (${loanAssetTotal})`,
      });
    }
  }

  for (const loan of loans.loans) {
    if (loan.fixed_asset_ids) {
      for (const aid of loan.fixed_asset_ids) {
        if (!assetIds.has(aid)) {
          issues.push({ message: `${loan.id}: fixed_asset_id ${aid} not in fixed-assets.yaml` });
        }
      }
    }
  }

  const prop001 = propertyById.get("PROP-001");
  if (prop001?.depreciation) {
    const asset001 = fixedAssets.assets.find((a) => a.id === "ASSET-001");
    if (asset001) {
      if (asset001.annual_depreciation !== prop001.depreciation.annual_amount) {
        issues.push({
          message: `ASSET-001 annual_depreciation (${asset001.annual_depreciation}) ≠ PROP-001.depreciation.annual_amount (${prop001.depreciation.annual_amount})`,
        });
      }
    }
  }

  const fy2026 = expensePlan.years.find((y) => y.fiscal_year === "FY2026");
  const depLine = fy2026?.lines.find((l) => l.id === "depreciation");
  if (depLine && fixedAssets.summary?.annual_depreciation_fy_current != null) {
    if (depLine.amount !== fixedAssets.summary.annual_depreciation_fy_current) {
      issues.push({
        message: `expense-plan FY2026 depreciation (${depLine.amount}) ≠ fixed-assets annual_depreciation_fy_current (${fixedAssets.summary.annual_depreciation_fy_current})`,
      });
    }
  }

  if (fixedAssets.summary) {
    const calcCost = fixedAssets.assets.reduce((s, a) => s + a.acquisition_cost, 0);
    const calcAccum = fixedAssets.assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
    const calcBook = fixedAssets.assets.reduce((s, a) => s + a.book_value, 0);
    if (fixedAssets.summary.total_acquisition_cost !== calcCost) {
      issues.push({
        message: `summary total_acquisition_cost (${fixedAssets.summary.total_acquisition_cost}) ≠ sum of assets (${calcCost})`,
      });
    }
    if (fixedAssets.summary.total_accumulated_depreciation !== calcAccum) {
      issues.push({
        message: `summary total_accumulated_depreciation (${fixedAssets.summary.total_accumulated_depreciation}) ≠ sum of assets (${calcAccum})`,
      });
    }
    if (fixedAssets.summary.total_book_value !== calcBook) {
      issues.push({
        message: `summary total_book_value (${fixedAssets.summary.total_book_value}) ≠ sum of assets (${calcBook})`,
      });
    }
  }

  return issues;
}

export function loadBusinessPlan(): BusinessPlan {
  return readYamlFile(join(getDataDir(), "plans", "business-plan.yaml"), businessPlanSchema);
}

export function loadPropertyRevenuePlan(): PropertyRevenuePlan {
  return readYamlFile(
    join(getDataDir(), "plans", "property-revenue.yaml"),
    propertyRevenuePlanSchema
  );
}

export function loadYojitsuPlan(year: number): import("../../schemas/finance.js").YojitsuPlan | undefined {
  const path = join(getDataDir(), "plans", `yojitsu-${year}.yaml`);
  try {
    return normalizeYojitsuPlan(readYamlFile(path, yojitsuPlanSchema));
  } catch {
    return undefined;
  }
}

export function loadYojitsuFyPlan(
  fiscalYear: string
): import("../../schemas/finance.js").YojitsuPlan | undefined {
  const id = fiscalYear.toLowerCase().replace(/^fy/, "fy");
  const path = join(getDataDir(), "plans", `yojitsu-${id}.yaml`);
  try {
    return normalizeYojitsuPlan(readYamlFile(path, yojitsuPlanSchema));
  } catch {
    return undefined;
  }
}

export function loadRevenuePlan() {
  return readYamlFile(join(getDataDir(), "plans", "revenue-plan.yaml"), revenuePlanSchema);
}

export function loadProfitPlan() {
  return readYamlFile(join(getDataDir(), "plans", "profit-plan.yaml"), profitPlanSchema);
}

export function loadExpensePlan() {
  return readYamlFile(join(getDataDir(), "plans", "expense-plan.yaml"), expensePlanSchema);
}

export function loadInvestmentPlan() {
  return readYamlFile(join(getDataDir(), "plans", "investment-plan.yaml"), investmentPlanSchema);
}

export function loadDebtPlan() {
  return readYamlFile(join(getDataDir(), "plans", "debt-plan.yaml"), debtPlanSchema);
}

export function loadOperationsPublic(): FacilityPublic {
  const rel = getPrimaryOperationsPublicRel();
  if (!rel) {
    throw new Error("No enabled module with operations_public in modules.yaml");
  }
  return readYamlFile(resolveTenantPath(rel), facilityPublicSchema);
}

export function loadEmployees(): EmployeesFile {
  return readYamlFile(join(getDataDir(), "hr", "employees.yaml"), employeesFileSchema);
}

export function loadExecutiveCalendar(): CalendarFile {
  return readYamlFile(join(getDataDir(), "executive", "calendar.yaml"), calendarFileSchema);
}

export function loadExecutiveTasks(): TasksFile {
  return readYamlFile(join(getDataDir(), "executive", "tasks.yaml"), tasksFileSchema);
}

export function loadOneOnOnes(): OneOnOnesFile {
  return readYamlFile(join(getDataDir(), "executive", "one-on-ones.yaml"), oneOnOnesFileSchema);
}

export function loadExternalContacts(): ExternalContactsFile {
  return readYamlFile(
    join(getDataDir(), "executive", "external-contacts.yaml"),
    externalContactsFileSchema
  );
}

export function loadStakeholders(): StakeholdersFile {
  return readYamlFile(join(getDataDir(), "executive", "stakeholders.yaml"), stakeholdersFileSchema);
}

export function loadAllData(): StewardData {
  return {
    company: loadCompany(),
    properties: loadProperties(),
    contracts: loadContracts(),
    monthlyFinances: loadMonthlyFinances(),
    fixedCosts: loadFixedCosts(),
    loans: loadLoans(),
    businessPlan: loadBusinessPlan(),
    propertyRevenuePlan: loadPropertyRevenuePlan(),
  };
}

export function validateAll(): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const tryLoad = (file: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      errors.push({
        file,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  tryLoad("data/company.yaml", () => loadCompany());

  for (const f of listYamlFiles(join(getDataDir(), "properties"))) {
    tryLoad(toLogicalPath(f), () =>
      readYamlFile(f, propertySchema)
    );
  }

  for (const f of listYamlFiles(join(getDataDir(), "contracts"))) {
    tryLoad(toLogicalPath(f), () =>
      readYamlFile(f, contractSchema)
    );
  }

  for (const f of listYamlFiles(join(getDataDir(), "finance", "monthly"))) {
    tryLoad(toLogicalPath(f), () =>
      readYamlFile(f, monthlyFinanceSchema)
    );
  }

  tryLoad("data/finance/fixed-costs.yaml", () => loadFixedCosts());
  tryLoad("data/finance/payroll.yaml", () => loadPayroll());
  tryLoad("data/finance/cash-balance.yaml", () => loadCashBalance());
  tryLoad("data/finance/loans.yaml", () => loadLoans());
  tryLoad("data/finance/fixed-assets.yaml", () => loadFixedAssets());
  tryLoad("data/finance/tax-profile.yaml", () => loadTaxProfile());
  tryLoad("data/finance/chart-of-accounts.yaml", () => loadChartOfAccounts());
  tryLoad("data/plans/business-plan.yaml", () => loadBusinessPlan());
  tryLoad("data/plans/property-revenue.yaml", () => loadPropertyRevenuePlan());
  tryLoad("data/plans/revenue-plan.yaml", () => loadRevenuePlan());
  tryLoad("data/plans/profit-plan.yaml", () => loadProfitPlan());
  tryLoad("data/plans/expense-plan.yaml", () => loadExpensePlan());
  tryLoad("data/plans/investment-plan.yaml", () => loadInvestmentPlan());
  tryLoad("data/plans/debt-plan.yaml", () => loadDebtPlan());
  for (const f of listYamlFiles(join(getDataDir(), "plans")).filter((p) =>
    p.includes("yojitsu-")
  )) {
    tryLoad(toLogicalPath(f), () =>
      readYamlFile(f, yojitsuPlanSchema)
    );
  }

  for (const mod of loadEnabledModules()) {
    if (mod.operations_public) {
      tryLoad(mod.operations_public, () =>
        readYamlFile(resolveTenantPath(mod.operations_public!), facilityPublicSchema)
      );
    }
  }
  tryLoad("data/hr/employees.yaml", () => loadEmployees());
  const executiveCalendar = join(getDataDir(), "executive", "calendar.yaml");
  if (existsSync(executiveCalendar)) {
    tryLoad("data/executive/calendar.yaml", () => loadExecutiveCalendar());
  }
  const executiveTasks = join(getDataDir(), "executive", "tasks.yaml");
  if (existsSync(executiveTasks)) {
    tryLoad("data/executive/tasks.yaml", () => loadExecutiveTasks());
  }
  const executiveOoo = join(getDataDir(), "executive", "one-on-ones.yaml");
  if (existsSync(executiveOoo)) {
    tryLoad("data/executive/one-on-ones.yaml", () => loadOneOnOnes());
  }
  const executiveExt = join(getDataDir(), "executive", "external-contacts.yaml");
  if (existsSync(executiveExt)) {
    tryLoad("data/executive/external-contacts.yaml", () => loadExternalContacts());
  }
  if (existsSync(getStakeholdersYaml())) {
    tryLoad("data/executive/stakeholders.yaml", () => loadStakeholders());
  }
  const schedulingCases = join(getDataDir(), "executive", "scheduling-cases.yaml");
  if (existsSync(schedulingCases)) {
    tryLoad("data/executive/scheduling-cases.yaml", () => loadSchedulingCases());
  }
  tryLoad("data/classification-registry.yaml", () =>
    readYamlFile(join(getDataDir(), "classification-registry.yaml"), classificationRegistrySchema)
  );

  for (const issue of validateModules()) {
    errors.push({ file: issue.file, message: issue.message });
  }

  for (const message of validateLegacyRosterFiles()) {
    errors.push({ file: "data/operator/agents-enabled.yaml", message });
  }

  for (const issue of validateRegulations()) {
    errors.push({ file: issue.file, message: issue.message });
  }

  tryLoad("data/document-io.yaml", () =>
    readYamlFile(join(getDataDir(), "document-io.yaml"), documentIoSchema)
  );

  const vcFundsPath = join(getDataDir(), "venture-capital", "funds.yaml");
  const vcPortfolioPath = join(getDataDir(), "venture-capital", "portfolio.yaml");
  if (existsSync(vcFundsPath)) {
    tryLoad("data/venture-capital/funds.yaml", () =>
      readYamlFile(vcFundsPath, fundsFileSchema)
    );
  }
  if (existsSync(vcPortfolioPath)) {
    tryLoad("data/venture-capital/portfolio.yaml", () =>
      readYamlFile(vcPortfolioPath, portfolioFileSchema)
    );
  }

  // Cross-reference validation (legacy inline checks)
  if (errors.length === 0) {
    try {
      const data = loadAllData();
      const propertyIds = new Set(data.properties.map((p) => p.id));

      for (const c of data.contracts) {
        if (c.property_id && !propertyIds.has(c.property_id)) {
          errors.push({
            file: `data/contracts/${c.id}.yaml`,
            message: `property_id ${c.property_id} not found`,
          });
        }
      }

      for (const plan of data.propertyRevenuePlan.rental) {
        if (!propertyIds.has(plan.property_id)) {
          errors.push({
            file: "data/plans/property-revenue.yaml",
            message: `rental plan references unknown property ${plan.property_id}`,
          });
        }
      }

      for (const plan of data.propertyRevenuePlan.hotel) {
        if (!propertyIds.has(plan.property_id)) {
          errors.push({
            file: "data/plans/property-revenue.yaml",
            message: `hotel plan references unknown property ${plan.property_id}`,
          });
        }
      }

      for (const issue of validateFixedAssetConsistency()) {
        errors.push({
          file: "data/finance/fixed-assets.yaml",
          message: issue.message,
        });
      }

      if (existsSync(vcFundsPath) && existsSync(vcPortfolioPath)) {
        const funds = readYamlFile(vcFundsPath, fundsFileSchema);
        const portfolio = readYamlFile(vcPortfolioPath, portfolioFileSchema);
        const fundIds = new Set(funds.funds.map((f) => f.id));
        for (const pc of portfolio.companies) {
          if (!fundIds.has(pc.fund_id)) {
            errors.push({
              file: "data/venture-capital/portfolio.yaml",
              message: `${pc.id} references unknown fund ${pc.fund_id}`,
            });
          }
        }
      }
    } catch (e) {
      errors.push({
        file: "cross-reference",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
