import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Contract, Property, Loan } from "../../schemas/index.js";
import {
  loadAllData,
  loadContracts,
  loadLoans,
  loadProperties,
  loadOperationsPublic,
  loadEmployees,
  loadYojitsuPlan,
  loadCashBalance,
  resolveCashBalanceTotal,
} from "./data.js";
import { facilitySecretsSchema } from "../../schemas/operations.js";
import { CURSOR_DIR, readYamlFile, ROOT_DIR } from "./utils.js";

export interface IntegrityIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

function docExists(relPath: string | undefined): boolean {
  if (!relPath) return false;
  return existsSync(join(ROOT_DIR, relPath));
}

export function runIntegrityChecks(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const push = (level: IntegrityIssue["level"], file: string, message: string) =>
    issues.push({ level, file, message });

  let data;
  try {
    data = loadAllData();
  } catch (e) {
    push("error", "cross-reference", e instanceof Error ? e.message : String(e));
    return issues;
  }

  const propertyIds = new Set(data.properties.map((p) => p.id));
  const propertyById = new Map(data.properties.map((p) => [p.id, p]));
  const contractById = new Map(data.contracts.map((c) => [c.id, c]));
  const loanById = new Map(data.loans.loans.map((l) => [l.id, l]));

  for (const c of data.contracts) {
    if (c.property_id && !propertyIds.has(c.property_id)) {
      push("error", `cursor/data/contracts/${c.id}.yaml`, `property_id ${c.property_id} not found`);
    }
    if (c.status === "executed" && !c.executed_date) {
      push("warning", `cursor/data/contracts/${c.id}.yaml`, "executed status but no executed_date");
    }
    if (c.status === "executed" && c.documents?.executed && !docExists(c.documents.executed)) {
      push("warning", `cursor/data/contracts/${c.id}.yaml`, `executed doc missing: ${c.documents.executed}`);
    }
    if (c.status === "draft" && c.documents?.enrollment && !docExists(c.documents.enrollment)) {
      push("warning", `cursor/data/contracts/${c.id}.yaml`, `enrollment doc missing: ${c.documents.enrollment}`);
    }
  }

  for (const plan of data.propertyRevenuePlan.rental) {
    if (!propertyIds.has(plan.property_id)) {
      push("error", "cursor/data/plans/property-revenue.yaml", `rental plan references unknown property ${plan.property_id}`);
    }
  }
  for (const plan of data.propertyRevenuePlan.hotel) {
    if (!propertyIds.has(plan.property_id)) {
      push("error", "cursor/data/plans/property-revenue.yaml", `hotel plan references unknown property ${plan.property_id}`);
    }
  }

  for (const p of data.properties) {
    if (p.financing) {
      const loan = loanById.get(p.financing);
      if (!loan) {
        push("error", `cursor/data/properties/${p.id}.yaml`, `financing ${p.financing} not found in loans.yaml`);
      } else {
        if (loan.property_id && loan.property_id !== p.id) {
          push("error", "cursor/data/finances/loans.yaml", `${loan.id} property_id ${loan.property_id} ≠ ${p.id}`);
        }
        if (p.acquisition_price !== undefined && loan.balance !== p.acquisition_price) {
          push(
            "warning",
            `cursor/data/properties/${p.id}.yaml`,
            `acquisition_price ${p.acquisition_price} ≠ loan balance ${loan.balance}`
          );
        }
      }
    }
  }

  for (const loan of data.loans.loans) {
    checkLoanRefs(loan, contractById, propertyById, push);
  }

  const yojitsu2026 = loadYojitsuPlan(2026);
  if (yojitsu2026 && yojitsu2026.months.length !== 12) {
    push("warning", "cursor/data/plans/yojitsu-2026.yaml", `expected 12 months, got ${yojitsu2026.months.length}`);
  }

  try {
    const ops = loadOperationsPublic();
    if (ops.property_id && !propertyIds.has(ops.property_id)) {
      push("error", "cursor/data/operations/kamezawa-public.yaml", `property_id ${ops.property_id} not found`);
    }
    for (const [, path] of Object.entries(ops.guest_docs ?? {})) {
      if (path && !docExists(path)) {
        push("warning", "cursor/data/operations/kamezawa-public.yaml", `guest doc missing: ${path}`);
      }
    }
  } catch (e) {
    push("warning", "cursor/data/operations/kamezawa-public.yaml", e instanceof Error ? e.message : String(e));
  }

  const secretsPath = join(CURSOR_DIR, "data", "operations", "kamezawa-secrets.yaml");
  if (existsSync(secretsPath)) {
    try {
      const secrets = readYamlFile(secretsPath, facilitySecretsSchema);
      const placeholders = Object.entries(secrets).filter(
        ([, v]) => typeof v === "string" && (v === "REPLACE_ME" || v === "TBD" || v.startsWith("TBD"))
      );
      if (placeholders.length) {
        push(
          "warning",
          "cursor/data/operations/kamezawa-secrets.yaml",
          `${placeholders.length} 項目が未入力（REPLACE_ME / TBD）`
        );
      }
    } catch (e) {
      push("warning", "cursor/data/operations/kamezawa-secrets.yaml", e instanceof Error ? e.message : String(e));
    }
  } else {
    push(
      "warning",
      "cursor/data/operations/kamezawa-secrets.yaml",
      "未作成 — example をコピーして実値を記入"
    );
  }

  try {
    const cash = loadCashBalance();
    if (cash) {
      const total = resolveCashBalanceTotal(cash);
      if (cash.status === "template" && total == null) {
        push(
          "warning",
          "cursor/data/finances/cash-balance.yaml",
          "テンプレート — 残高入力後 status: confirmed に変更"
        );
      } else if (cash.status === "confirmed" && total == null) {
        push("warning", "cursor/data/finances/cash-balance.yaml", "confirmed だが total / accounts が未入力");
      }
    }
  } catch (e) {
    push("warning", "cursor/data/finances/cash-balance.yaml", e instanceof Error ? e.message : String(e));
  }

  try {
    const hr = loadEmployees();
    for (const emp of hr.employees) {
      if (emp.contract_id && !contractById.has(emp.contract_id)) {
        push("error", "cursor/data/hr/employees.yaml", `${emp.id} references unknown contract ${emp.contract_id}`);
      }
    }
  } catch (e) {
    push("warning", "cursor/data/hr/employees.yaml", e instanceof Error ? e.message : String(e));
  }

  return issues;
}

function checkLoanRefs(
  loan: Loan,
  contractById: Map<string, Contract>,
  propertyById: Map<string, Property>,
  push: (level: IntegrityIssue["level"], file: string, message: string) => void
): void {
  if (loan.property_id && !propertyById.has(loan.property_id)) {
    push("error", "cursor/data/finances/loans.yaml", `${loan.id} property_id ${loan.property_id} not found`);
  }
  if (loan.contract_id) {
    const ctr = contractById.get(loan.contract_id);
    if (!ctr) {
      push("error", "cursor/data/finances/loans.yaml", `${loan.id} contract_id ${loan.contract_id} not found`);
      return;
    }
    if (ctr.type !== "loan") {
      push("warning", "cursor/data/finances/loans.yaml", `${loan.id} linked contract ${loan.contract_id} type is ${ctr.type}`);
    }
    if (loan.property_id && ctr.property_id && loan.property_id !== ctr.property_id) {
      push("error", "cursor/data/finances/loans.yaml", `${loan.id} property_id ≠ contract ${loan.contract_id} property_id`);
    }
    if (ctr.compensation?.amount !== undefined && loan.balance !== ctr.compensation.amount) {
      push(
        "warning",
        "cursor/data/finances/loans.yaml",
        `${loan.id} balance ${loan.balance} ≠ contract amount ${ctr.compensation.amount}`
      );
    }
    if (loan.documents?.executed && !docExists(loan.documents.executed)) {
      push("warning", "cursor/data/finances/loans.yaml", `${loan.id} executed doc missing: ${loan.documents.executed}`);
    }
  }
}

export function integrityErrorsOnly(issues: IntegrityIssue[]): IntegrityIssue[] {
  return issues.filter((i) => i.level === "error");
}

export function summarizeIntegrity(issues: IntegrityIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}

/** Lightweight check used by status — no throws */
export function countDataFiles(): {
  properties: number;
  contracts: number;
  monthlyFinances: number;
  loans: number;
} {
  return {
    properties: loadProperties().length,
    contracts: loadContracts().length,
    monthlyFinances: loadAllData().monthlyFinances.length,
    loans: loadLoans().loans.length,
  };
}
