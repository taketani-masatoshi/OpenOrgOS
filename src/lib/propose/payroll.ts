import { loadPayroll } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

/** Broker-transfer proposal. Does not pay and does not file tax. */
export function proposePayrollTransfer(input: {
  payrollRunId: string;
  totalYen: number;
  payee?: string;
}): {
  payrollRunId: string;
  totalYen: number;
  amountYen: number;
  payee: string;
  reference: string;
  instruction: "broker transfer";
  executed: false;
  dryRun: true;
} {
  return {
    payrollRunId: input.payrollRunId,
    totalYen: input.totalYen,
    amountYen: input.totalYen,
    payee: input.payee ?? "payroll",
    reference: input.payrollRunId,
    instruction: "broker transfer",
    executed: false,
    dryRun: true,
  };
}

/** Resolve a monthly total from payroll.yaml when totalYen is omitted. */
export function resolvePayrollTotalYen(explicit?: number): {
  totalYen: number;
  inputs_ref: string[];
} {
  if (explicit != null) return { totalYen: explicit, inputs_ref: [] };
  try {
    const payroll = loadPayroll();
    const officer =
      payroll.officers?.reduce((sum, row) => sum + (row.monthly ?? 0), 0) ?? 0;
    const employees = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
    return {
      totalYen: officer + employees,
      inputs_ref: ["data/finance/payroll.yaml"],
    };
  } catch {
    return { totalYen: 0, inputs_ref: [] };
  }
}

/** One report. Dry-run only — no bank API transfer and no tax filing. */
export function renderPayrollTransferReport(input: {
  payrollRunId: string;
  totalYen?: number;
  payee?: string;
}): Record<string, unknown> {
  const resolved = resolvePayrollTotalYen(input.totalYen);
  const proposal = proposePayrollTransfer({
    payrollRunId: input.payrollRunId,
    totalYen: resolved.totalYen,
    payee: input.payee,
  });
  return flattenProposeReport(
    makeProposeReport({
      kind: "payroll-transfer-report",
      depth: resolved.inputs_ref.length > 0 ? "L2" : "L0",
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human", executed: false },
      payload: { ...proposal, taxFiled: false },
    }),
  );
}
