import {
  allocateDepartmentCategoryBudget,
  allocateMemberBudget,
  budgetDelegationRevision,
  budgetDelegationSummary,
  loadBudgetDelegation,
  normalizeBudgetFiscalYear,
  resolveActiveBudgetFiscalYear,
  rolloverBudgetFiscalYear,
  setCompanyCategoryBudget,
} from "../lib/org/budget-delegation.js";
import {
  auditCliMutation,
  requireCliHumanApproval,
  requireCliOperator,
} from "../lib/console-auth/cli-operator.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function runBudgetShow(opts: {
  fiscalYear?: string;
  json?: boolean;
}): void {
  const fy = normalizeBudgetFiscalYear(
    opts.fiscalYear ?? resolveActiveBudgetFiscalYear(),
  );
  const file = loadBudgetDelegation({ fiscalYear: fy });
  if (!file) {
    console.error(`Budget delegation not found for ${fy}`);
    process.exit(1);
  }
  const summary = budgetDelegationSummary(file);
  if (opts.json) {
    printJson({
      fiscal_year: fy,
      revision: budgetDelegationRevision(file),
      summary,
    });
    return;
  }
  console.log(`# 予算配分 ${fy} (revision ${budgetDelegationRevision(file)})\n`);
  console.log(
    `company: ${summary.company_budget_yen.toLocaleString()} JPY · departments: ${summary.department_allocated_yen.toLocaleString()} JPY`,
  );
  for (const dept of summary.departments) {
    console.log(
      `- ${dept.org_unit_id}: ${dept.allocation_yen.toLocaleString()} JPY · available ${dept.available_to_delegate_yen.toLocaleString()}`,
    );
  }
}

export function runBudgetAllocateDepartment(opts: {
  orgUnitId: string;
  accountCode: string;
  amountYen: number;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliOperator({
    operatorId: opts.operatorId,
    permission: "escalate:plan",
    command: "budget allocate-department",
  });
  const result = allocateDepartmentCategoryBudget({
    orgUnitId: opts.orgUnitId,
    accountCode: opts.accountCode,
    amountYen: opts.amountYen,
    actor: auth.record,
    expectedRevision: opts.expectedRevision,
  });
  auditCliMutation(
    "budget allocate-department",
    `${opts.orgUnitId}/${opts.accountCode}`,
  );
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ department budget updated for ${opts.orgUnitId}`);
}

export function runBudgetAllocateMember(opts: {
  orgUnitId: string;
  memberOperatorId: string;
  amountYen: number;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliOperator({
    operatorId: opts.operatorId,
    permission: "escalate:plan",
    command: "budget allocate-member",
  });
  const result = allocateMemberBudget({
    orgUnitId: opts.orgUnitId,
    memberOperatorId: opts.memberOperatorId,
    amountYen: opts.amountYen,
    actor: auth.record,
    expectedRevision: opts.expectedRevision,
  });
  auditCliMutation(
    "budget allocate-member",
    `${opts.memberOperatorId}@${opts.orgUnitId}`,
  );
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ member budget updated for ${opts.memberOperatorId}`);
}

export function runBudgetSetCompanyCategory(opts: {
  accountCode: string;
  amountYen: number;
  operatorId?: string;
  expectedRevision?: string;
  json?: boolean;
}): void {
  const auth = requireCliHumanApproval("budget set-company");
  const result = setCompanyCategoryBudget({
    accountCode: opts.accountCode,
    amountYen: opts.amountYen,
    actor: auth.record,
    expectedRevision: opts.expectedRevision,
  });
  auditCliMutation("budget set-company", opts.accountCode);
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ company category budget set for ${opts.accountCode}`);
}

export function runBudgetRollover(opts: {
  fromFiscalYear?: string;
  toFiscalYear: string;
  operatorId?: string;
  json?: boolean;
}): void {
  const auth = requireCliHumanApproval("budget rollover");
  const result = rolloverBudgetFiscalYear({
    fromFiscalYear: opts.fromFiscalYear,
    toFiscalYear: opts.toFiscalYear,
    actorOperatorId: auth.record.operator_id,
  });
  auditCliMutation(
    "budget rollover",
    `${opts.fromFiscalYear ?? "active"}->${opts.toFiscalYear}`,
  );
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`✓ rolled over to ${result.to}`);
}
