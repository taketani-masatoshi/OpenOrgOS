import { loadEnabledModulesSafe } from "../modules.js";
import { generateJpBankCashflow } from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";

export function isJpBankCorporateEnabled(): boolean {
  return loadEnabledModulesSafe().some(
    (module) =>
      module.enabled &&
      (module.id === "jp_bank_corporate" || module.agent === "jp_bank_corporate")
  );
}

/** Regenerate weekly cashflow artifacts when jp_bank_corporate is enabled. */
export function runJpBankCorporatePipelineCashflow(): {
  ran: boolean;
  output_paths: string[];
} {
  if (!isJpBankCorporateEnabled()) {
    return { ran: false, output_paths: [] };
  }
  const json = generateJpBankCashflow({
    granularity: "weekly",
    horizon: "13w",
    format: "json",
    write: true,
  });
  const markdown = generateJpBankCashflow({
    granularity: "weekly",
    horizon: "13w",
    format: "md",
    write: true,
  });
  const detail = generateJpBankCashflow({
    granularity: "daily",
    horizon: "13w",
    format: "csv",
    write: true,
  });
  return {
    ran: true,
    output_paths: [json.output_path, markdown.output_path, detail.output_path].filter(
      (path, index, all) => all.indexOf(path) === index
    ),
  };
}
