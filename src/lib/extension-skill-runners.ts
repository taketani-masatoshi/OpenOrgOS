import type { SkillRunOptions } from "../commands/skills.js";
import {
  formatGovernanceMeetingsMarkdown,
  formatGovernanceRegisterMarkdown,
  formatPrivacyImpactMarkdown,
  formatPrivacyInventoryMarkdown,
  formatProcurementOrdersMarkdown,
  formatProcurementVendorsMarkdown,
  formatRiskInsuranceMarkdown,
  formatRiskRegisterMarkdown,
  loadGovernanceMeetings,
  loadGovernanceRegister,
  loadProcurementOrders,
  loadProcurementVendors,
  loadRiskInsurance,
  loadRiskRegister,
} from "./extension-sot.js";
import { writeMarkdownReport } from "./utils.js";

function emit(subdir: string, md: string, opts: SkillRunOptions): void {
  if (opts.output) {
    const path = writeMarkdownReport(subdir, opts.output, md);
    console.log(`Wrote ${path}`);
    return;
  }
  console.log(md);
}

export function runProcurementOrderReviewSkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/procurement", formatProcurementOrdersMarkdown(loadProcurementOrders()), opts);
}

export function runProcurementVendorEvalSkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/procurement", formatProcurementVendorsMarkdown(loadProcurementVendors()), opts);
}

export function runGovernanceMeetingPrepSkill(opts: SkillRunOptions = {}): void {
  emit(
    "agent-summaries/corporate-governance",
    formatGovernanceMeetingsMarkdown(loadGovernanceMeetings()),
    opts
  );
}

export function runGovernanceRegisterReviewSkill(opts: SkillRunOptions = {}): void {
  emit(
    "agent-summaries/corporate-governance",
    formatGovernanceRegisterMarkdown(loadGovernanceRegister()),
    opts
  );
}

export function runRiskRegisterReviewSkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/risk-insurance", formatRiskRegisterMarkdown(loadRiskRegister()), opts);
}

export function runRiskInsuranceRenewalSkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/risk-insurance", formatRiskInsuranceMarkdown(loadRiskInsurance()), opts);
}

export function runPrivacyDataInventorySkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/privacy-officer", formatPrivacyInventoryMarkdown(), opts);
}

export function runPrivacyImpactReviewSkill(opts: SkillRunOptions = {}): void {
  emit("agent-summaries/privacy-officer", formatPrivacyImpactMarkdown(), opts);
}
