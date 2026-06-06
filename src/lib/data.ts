import { join } from "node:path";
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
  revenuePlanSchema,
  profitPlanSchema,
  expensePlanSchema,
  investmentPlanSchema,
  type Company,
  type Property,
  type Contract,
  type MonthlyFinance,
  type FixedCosts,
  type Loans,
  type BusinessPlan,
  type PropertyRevenuePlan,
} from "../../schemas/index.js";
import {
  DATA_DIR,
  readYamlFile,
  listYamlFiles,
} from "./utils.js";

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
  return readYamlFile(join(DATA_DIR, "company.yaml"), companySchema);
}

export function loadProperties(): Property[] {
  return listYamlFiles(join(DATA_DIR, "properties")).map((f) =>
    readYamlFile(f, propertySchema)
  );
}

export function loadProperty(id: string): Property | undefined {
  const path = join(DATA_DIR, "properties", `${id}.yaml`);
  try {
    return readYamlFile(path, propertySchema);
  } catch {
    return undefined;
  }
}

export function loadContracts(): Contract[] {
  return listYamlFiles(join(DATA_DIR, "contracts")).map((f) =>
    readYamlFile(f, contractSchema)
  );
}

export function loadContract(id: string): Contract | undefined {
  const path = join(DATA_DIR, "contracts", `${id}.yaml`);
  try {
    return readYamlFile(path, contractSchema);
  } catch {
    return undefined;
  }
}

export function loadMonthlyFinances(): MonthlyFinance[] {
  return listYamlFiles(join(DATA_DIR, "finances", "monthly"))
    .map((f) => readYamlFile(f, monthlyFinanceSchema))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function loadMonthlyFinance(month: string): MonthlyFinance | undefined {
  const path = join(DATA_DIR, "finances", "monthly", `${month}.yaml`);
  try {
    return readYamlFile(path, monthlyFinanceSchema);
  } catch {
    return undefined;
  }
}

export function loadFixedCosts(): FixedCosts {
  return readYamlFile(join(DATA_DIR, "finances", "fixed-costs.yaml"), fixedCostsSchema);
}

export function loadPayroll() {
  return readYamlFile(join(DATA_DIR, "finances", "payroll.yaml"), payrollSchema);
}

export function loadLoans(): Loans {
  return readYamlFile(join(DATA_DIR, "finances", "loans.yaml"), loansSchema);
}

export function loadBusinessPlan(): BusinessPlan {
  return readYamlFile(join(DATA_DIR, "plans", "business-plan.yaml"), businessPlanSchema);
}

export function loadPropertyRevenuePlan(): PropertyRevenuePlan {
  return readYamlFile(
    join(DATA_DIR, "plans", "property-revenue.yaml"),
    propertyRevenuePlanSchema
  );
}

export function loadYojitsuPlan(year: number): import("../../schemas/finance.js").YojitsuPlan | undefined {
  const path = join(DATA_DIR, "plans", `yojitsu-${year}.yaml`);
  try {
    return readYamlFile(path, yojitsuPlanSchema);
  } catch {
    return undefined;
  }
}

export function loadYojitsuFyPlan(
  fiscalYear: string
): import("../../schemas/finance.js").YojitsuPlan | undefined {
  const id = fiscalYear.toLowerCase().replace(/^fy/, "fy");
  const path = join(DATA_DIR, "plans", `yojitsu-${id}.yaml`);
  try {
    return readYamlFile(path, yojitsuPlanSchema);
  } catch {
    return undefined;
  }
}

export function loadRevenuePlan() {
  return readYamlFile(join(DATA_DIR, "plans", "revenue-plan.yaml"), revenuePlanSchema);
}

export function loadProfitPlan() {
  return readYamlFile(join(DATA_DIR, "plans", "profit-plan.yaml"), profitPlanSchema);
}

export function loadExpensePlan() {
  return readYamlFile(join(DATA_DIR, "plans", "expense-plan.yaml"), expensePlanSchema);
}

export function loadInvestmentPlan() {
  return readYamlFile(join(DATA_DIR, "plans", "investment-plan.yaml"), investmentPlanSchema);
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

  tryLoad("cursor/data/company.yaml", () => loadCompany());

  for (const f of listYamlFiles(join(DATA_DIR, "properties"))) {
    tryLoad(f.replace(DATA_DIR + "/", "cursor/data/"), () =>
      readYamlFile(f, propertySchema)
    );
  }

  for (const f of listYamlFiles(join(DATA_DIR, "contracts"))) {
    tryLoad(f.replace(DATA_DIR + "/", "cursor/data/"), () =>
      readYamlFile(f, contractSchema)
    );
  }

  for (const f of listYamlFiles(join(DATA_DIR, "finances", "monthly"))) {
    tryLoad(f.replace(DATA_DIR + "/", "cursor/data/"), () =>
      readYamlFile(f, monthlyFinanceSchema)
    );
  }

  tryLoad("cursor/data/finances/fixed-costs.yaml", () => loadFixedCosts());
  tryLoad("cursor/data/finances/payroll.yaml", () => loadPayroll());
  tryLoad("cursor/data/finances/loans.yaml", () => loadLoans());
  tryLoad("cursor/data/plans/business-plan.yaml", () => loadBusinessPlan());
  tryLoad("cursor/data/plans/property-revenue.yaml", () => loadPropertyRevenuePlan());
  tryLoad("cursor/data/plans/revenue-plan.yaml", () => loadRevenuePlan());
  tryLoad("cursor/data/plans/profit-plan.yaml", () => loadProfitPlan());
  tryLoad("cursor/data/plans/expense-plan.yaml", () => loadExpensePlan());
  tryLoad("cursor/data/plans/investment-plan.yaml", () => loadInvestmentPlan());
  for (const f of listYamlFiles(join(DATA_DIR, "plans")).filter((p) =>
    p.includes("yojitsu-")
  )) {
    tryLoad(f.replace(DATA_DIR + "/", "cursor/data/"), () =>
      readYamlFile(f, yojitsuPlanSchema)
    );
  }

  // Cross-reference validation
  if (errors.length === 0) {
    try {
      const data = loadAllData();
      const propertyIds = new Set(data.properties.map((p) => p.id));

      for (const c of data.contracts) {
        if (c.property_id && !propertyIds.has(c.property_id)) {
          errors.push({
            file: `cursor/data/contracts/${c.id}.yaml`,
            message: `property_id ${c.property_id} not found`,
          });
        }
      }

      for (const plan of data.propertyRevenuePlan.rental) {
        if (!propertyIds.has(plan.property_id)) {
          errors.push({
            file: "cursor/data/plans/property-revenue.yaml",
            message: `rental plan references unknown property ${plan.property_id}`,
          });
        }
      }

      for (const plan of data.propertyRevenuePlan.hotel) {
        if (!propertyIds.has(plan.property_id)) {
          errors.push({
            file: "cursor/data/plans/property-revenue.yaml",
            message: `hotel plan references unknown property ${plan.property_id}`,
          });
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
