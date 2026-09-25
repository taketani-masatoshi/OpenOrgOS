/**
 * Jurisdiction indirect-tax capability. installed ≠ filing-ready.
 */
import type { IndirectTaxFamily } from "../../../../schemas/jurisdiction.js";
import { getResolvedJurisdiction } from "../../jurisdiction.js";

export type IndirectTaxEngineId =
  | "jp"
  | "ee_vat"
  | "ge_vat"
  | "us_sales"
  | "none"
  | "uninstalled";

export type IndirectTaxCapability = {
  engine: IndirectTaxEngineId;
  installed: boolean;
  /** Filing / return submission is always refused until a dedicated module certifies. */
  filing: false;
  detail: string;
};

function mapEngine(
  code: string,
  family: IndirectTaxFamily | undefined
): Omit<IndirectTaxCapability, "filing"> {
  if (family === "none") {
    return { engine: "none", installed: true, detail: "no indirect tax" };
  }
  if (code === "JP" && family === "vat_credit") {
    return { engine: "jp", installed: true, detail: "jp consumption tax" };
  }
  if (code === "EE" && family === "vat_credit") {
    return {
      engine: "ee_vat",
      installed: false,
      detail: "EE VAT engine not ready for filing",
    };
  }
  if (code === "GE") {
    return {
      engine: "ge_vat",
      installed: false,
      detail: "GE indirect-tax engine not ready for filing",
    };
  }
  if (code === "US" && family === "sales_tax") {
    return {
      engine: "us_sales",
      installed: false,
      detail: "US sales-tax engine not ready for filing",
    };
  }
  return {
    engine: "uninstalled",
    installed: false,
    detail: "indirect tax engine not installed",
  };
}

export function resolveIndirectTaxCapability(): IndirectTaxCapability {
  const { code, pack } = getResolvedJurisdiction();
  const mapped = mapEngine(code, pack.indirect_tax_family);
  return { ...mapped, filing: false };
}
