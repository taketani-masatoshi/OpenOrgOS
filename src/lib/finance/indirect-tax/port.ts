/**
 * Indirect-tax close gate.
 * The ledger is shared. Only Japan + vat_credit runs the consumption-tax engine.
 */
import type { IndirectTaxFamily } from "../../../../schemas/jurisdiction.js";
import { getResolvedJurisdiction } from "../../jurisdiction.js";
import { loadChartOfAccounts } from "../../data.js";
import { buildConsumptionTaxSummary, runConsumptionTaxCheck } from "../consumption-tax.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import { jpIndirectTaxEngineInstalled } from "./family.js";

export const INDIRECT_TAX_ENGINE_UNINSTALLED = "indirect tax engine not installed";
export const INDIRECT_TAX_NONE = "no indirect tax";
export const JP_TAX_PROFILE_REQUIRED = "jp tax profile required";

export type IndirectTaxEngineId = "jp" | "uninstalled";

export type JpIndirectTaxEngine = {
  missingLineTaxCodes(month: string): string[];
  summarize(month: string): {
    issues?: Array<{ severity: string; message: string }>;
  };
  profileBlocking(): Array<{ message: string }>;
};

export type IndirectTaxCloseResult = {
  pass: boolean;
  detail: string;
  label: string;
  engine: IndirectTaxEngineId;
};

export function assertJpTaxProfile(): void {
  const { pack } = getResolvedJurisdiction();
  if (pack.tax_profile_schema !== "jp") {
    throw new Error(JP_TAX_PROFILE_REQUIRED);
  }
}

export function missingLineTaxCodes(month: string): string[] {
  const types = new Map(
    loadChartOfAccounts().accounts.map((account) => [account.code, account.type]),
  );
  const missing: string[] = [];
  for (const entry of loadJournalEntries().entries) {
    if (!entry.occurred_at.startsWith(month)) continue;
    for (const line of entry.lines) {
      const type = types.get(line.account_code);
      if (type !== "revenue" && type !== "expense") continue;
      if (!line.tax_category) {
        missing.push(`${entry.entry_id}:${line.account_code}`);
      }
    }
  }
  return missing;
}

function defaultJpEngine(): JpIndirectTaxEngine {
  return {
    missingLineTaxCodes,
    summarize: (month) => buildConsumptionTaxSummary({ period: month }),
    profileBlocking: () =>
      runConsumptionTaxCheck().issues.filter((issue) => issue.severity === "blocking"),
  };
}

function idleDetail(family: IndirectTaxFamily): string {
  if (family === "none") return INDIRECT_TAX_NONE;
  return INDIRECT_TAX_ENGINE_UNINSTALLED;
}

function evaluateJpClose(month: string, engine: JpIndirectTaxEngine): IndirectTaxCloseResult {
  const missing = engine.missingLineTaxCodes(month);
  if (missing.length > 0) {
    return {
      pass: false,
      detail: `missing tax_category ${missing.join(", ")}`,
      label: "消費税集計",
      engine: "jp",
    };
  }
  try {
    const summaryErrors = (engine.summarize(month).issues ?? []).filter(
      (issue) => issue.severity === "error",
    );
    const profileErrors = engine.profileBlocking();
    if (summaryErrors.length > 0 || profileErrors.length > 0) {
      return {
        pass: false,
        detail: [...summaryErrors, ...profileErrors].map((issue) => issue.message).join("; "),
        label: "消費税集計",
        engine: "jp",
      };
    }
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
      label: "消費税集計",
      engine: "jp",
    };
  }
  return { pass: true, detail: "ok", label: "消費税集計", engine: "jp" };
}

export function evaluateIndirectTaxClose(
  month: string,
  engine: JpIndirectTaxEngine = defaultJpEngine(),
): IndirectTaxCloseResult {
  const resolved = getResolvedJurisdiction();
  const family = resolved.pack.indirect_tax_family;
  if (!jpIndirectTaxEngineInstalled()) {
    return {
      pass: true,
      detail: idleDetail(family),
      label: "間接税",
      engine: "uninstalled",
    };
  }
  return evaluateJpClose(month, engine);
}
