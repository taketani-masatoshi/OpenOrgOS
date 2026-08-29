import { loadChartOfAccounts, loadFixedAssets } from "../data.js";
import { computeAssetMonthlyDepreciation } from "./depreciation.js";

/** Resolve monthly close adjustment amount from amount_source string. */
export function resolveCloseAdjustmentAmount(
  amountSource: string,
  month: string,
): number {
  const parts = amountSource.trim().split(/\s+/);
  if (parts[0] === "fixed-assets" && parts.length >= 3) {
    const assetId = parts[1];
    const field = parts[2];
    const file = loadFixedAssets();
    const asset = file.assets.find((a) => a.id === assetId);
    if (!asset) return 0;
    if (field === "annual_depreciation") {
      return Math.floor(asset.annual_depreciation / 12);
    }
    if (field === "monthly_depreciation") {
      return computeAssetMonthlyDepreciation(asset, month);
    }
  }
  return 0;
}

export function resolveCloseAdjustmentAmountFromCoa(
  amountSource: string | undefined,
  month: string,
): number {
  if (!amountSource) return 0;
  const amount = resolveCloseAdjustmentAmount(amountSource, month);
  if (amount > 0) return amount;
  // Fallback: chart mapping note only — skip zero amounts
  loadChartOfAccounts();
  return 0;
}
