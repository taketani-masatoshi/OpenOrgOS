/**
 * Which indirect-tax engine is installed for the active tenant.
 * Kept separate so journal post guards can ask without loading the ledger.
 */
import { getResolvedJurisdiction } from "../../jurisdiction.js";

export function jpIndirectTaxEngineInstalled(): boolean {
  const resolved = getResolvedJurisdiction();
  return resolved.code === "JP" && resolved.pack.indirect_tax_family === "vat_credit";
}
