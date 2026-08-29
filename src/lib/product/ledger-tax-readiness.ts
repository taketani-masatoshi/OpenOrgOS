import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  consumptionTaxReadinessIssues,
  payrollAccrualPaymentReadinessIssues,
  statutoryFilingReadinessIssues,
} from "../finance/statutory-filing-readiness.js";
import { getInstallRoot } from "../orgos-paths.js";

export type TaxModuleReadiness = {
  module: "jp_tax_corporate";
  registered: boolean;
  xml_draft: boolean;
  path: string;
  note: string;
};

export type TaxReadinessReport = {
  etax_module: TaxModuleReadiness;
  statutory_issues: Array<{
    level: string;
    domain: string;
    message: string;
  }>;
  ready_for_handoff: boolean;
  note: string;
};

export function buildTaxReadinessReport(): TaxReadinessReport {
  const modulePath =
    "steward/jurisdiction-packs/JP/modules/jp_tax_corporate/module.manifest.yaml";
  const registered = existsSync(join(getInstallRoot(), modulePath));
  const xmlDraft = existsSync(
    join(getInstallRoot(), "src/lib/finance/jp-corporate-tax-xml.ts"),
  );
  const statutory = [
    ...statutoryFilingReadinessIssues(),
    ...consumptionTaxReadinessIssues(),
    ...payrollAccrualPaymentReadinessIssues(),
  ];
  const blocking = statutory.filter((row) => row.level === "error");
  return {
    etax_module: {
      module: "jp_tax_corporate",
      registered,
      xml_draft: xmlDraft,
      path: modulePath,
      note: "Phase 5b XML draft for advisor handoff; 5c e-Tax submit is human-only (ADR 0052)",
    },
    statutory_issues: statutory,
    ready_for_handoff: blocking.length === 0 && xmlDraft,
    note:
      "P4: orgos operations tax-corporate xml-draft · submission remains outside OrgOS",
  };
}
