import { existsSync } from "node:fs";
import { join } from "node:path";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { getDataDir } from "../utils.js";
import { companySchema } from "../../../schemas/company.js";

export type OnboardingSetupInput = {
  companyName?: string;
  fiscalYearEndMonth?: number;
  representative?: string;
};

export type OnboardingSetupResult = {
  ok: boolean;
  company_path: string;
};

export function applyOnboardingSetup(input: OnboardingSetupInput): OnboardingSetupResult {
  const path = join(getDataDir(), "company.yaml");
  const existing = existsSync(path)
    ? readYamlFile(path, companySchema)
    : companySchema.parse({ name: input.companyName ?? "株式会社未設定" });

  const company = companySchema.parse({
    ...existing,
    name: input.companyName?.trim() || existing.name,
    representative: input.representative?.trim() || existing.representative,
    fiscal_year_end_month:
      input.fiscalYearEndMonth ?? existing.fiscal_year_end_month ?? 3,
  });
  writeYamlFile(path, company);

  return {
    ok: true,
    company_path: "data/company.yaml",
  };
}
