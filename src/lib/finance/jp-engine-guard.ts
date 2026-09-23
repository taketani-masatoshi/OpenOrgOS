import { getResolvedJurisdiction } from "../jurisdiction.js";

export const JP_TAX_PROFILE_REQUIRED = "jp tax profile required";

const DEFAULT_ENGINE_MESSAGE =
  "Japanese finance engine requires an explicit JP jurisdiction and tax profile";

/** JP engines cannot infer tax residence or foreign establishment coverage. */
export function assertJapaneseFinanceEngine(message = DEFAULT_ENGINE_MESSAGE): void {
  const resolved = getResolvedJurisdiction();
  if (resolved.code !== "JP" || resolved.pack.tax_profile_schema !== "jp") {
    throw new Error(message);
  }
}
