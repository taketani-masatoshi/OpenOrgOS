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
