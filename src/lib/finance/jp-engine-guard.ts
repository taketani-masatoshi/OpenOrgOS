import { getResolvedJurisdiction } from "../jurisdiction.js";

/** JP engines cannot infer tax residence or foreign establishment coverage. */
export function assertJapaneseFinanceEngine(): void {
  const resolved = getResolvedJurisdiction();
  if (resolved.code !== "JP" || resolved.pack.tax_profile_schema !== "jp")
    throw new Error("Japanese finance engine requires an explicit JP jurisdiction and tax profile");
}
