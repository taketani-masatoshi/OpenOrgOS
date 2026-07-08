import { loadContract } from "../data.js";
import { resolveJurisdictionApprovalPolicy } from "../jurisdiction/wire-governance/index.js";

/** Wire adapter — resolve tier input amount from notice projection (tenant contract data). */
export function resolveNoticeAmountForWire(notice: {
  amount?: { value: number; currency: string };
  contract_id?: string;
}): { value: number; currency: string } {
  if (notice.amount) return notice.amount;
  if (notice.contract_id) {
    const contract = loadContract(notice.contract_id);
    const value = contract?.compensation?.amount ?? contract?.monthly_cost;
    if (value != null) {
      const policy = resolveJurisdictionApprovalPolicy();
      return { value, currency: policy.currency };
    }
  }
  const policy = resolveJurisdictionApprovalPolicy();
  return { value: 0, currency: policy.currency };
}
