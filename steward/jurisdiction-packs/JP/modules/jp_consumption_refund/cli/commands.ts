import { join } from "node:path";
import type { ConsumptionTaxClaimKind } from "../../../../../../schemas/finance/consumption-tax.js";
import {
  requireCliFinanceReconciliationApproval,
  requireCliHumanApproval,
} from "../../../../../../src/lib/console-auth/cli-operator.js";
import { loadTaxProfile } from "../../../../../../src/lib/data.js";
import {
  buildConsumptionTaxSummary,
  resolveConsumptionTaxMethod,
  resolveDeemedPurchaseRatePct,
} from "../../../../../../src/lib/finance/consumption-tax.js";
import {
  assessConsumptionRefundEligibility,
  formatConsumptionTaxEligibilityMarkdown,
} from "../../../../../../src/lib/finance/consumption-tax-eligibility.js";
import { buildRefundReceiveJournal } from "../../../../../../src/lib/finance/consumption-tax-refund-receipt.js";
import { appendJournalEntry } from "../../../../../../src/lib/finance/expense-claim-journal.js";
import { resolveJournalSourceAccounts } from "../../../../../../src/lib/finance/journal-source-accounts.js";
import { getModuleDataDir } from "../../../../../../src/lib/module-business-data.js";
import {
  currentDate,
  resolveTenantPath,
  writeTrackedFile,
  writeYamlFile,
} from "../../../../../../src/lib/utils.js";
import {
  CLAIMS_FILE,
  MODULE_ID,
  applyClaimStatus,
  assertPackable,
  findOpenClaim,
  formatClaimsShowMarkdown,
  formatRefundPackMarkdown,
  loadClaimsFile,
  proposeClaimFromAssessment,
  replaceClaim,
  requireRefundModuleEnabled,
  validateClaims,
} from "./lib.js";
import type {
  ConsumptionRefundClaimStatus,
  ConsumptionRefundClaimsFile,
} from "./schema.js";

function resolveAssessment(opts: {
  period: string;
  method?: "standard" | "simplified";
  deemedRate?: number;
}) {
  let profile: ReturnType<typeof loadTaxProfile> | undefined;
  try {
    profile = loadTaxProfile();
  } catch {
    /* optional */
  }
  return buildConsumptionTaxSummary({
    period: opts.period,
    method: resolveConsumptionTaxMethod(profile, opts.method),
    deemedPurchaseRatePct: resolveDeemedPurchaseRatePct(profile, opts.deemedRate),
  });
}

export function runRefundShow(opts: { json?: boolean } = {}): void {
  const file = loadClaimsFile();
  if (opts.json) {
    console.log(JSON.stringify(file, null, 2));
    return;
  }
  console.log(formatClaimsShowMarkdown(file));
}

export function runRefundValidate(): void {
  requireRefundModuleEnabled();
  const file = loadClaimsFile();
  const issues = validateClaims(file);
  if (issues.length) {
    for (const issue of issues) console.error(`- ${issue}`);
    throw new Error(`consumption-refund validate failed (${issues.length})`);
  }
  console.log(`✓ consumption-refund claims ${file.claims.length}`);
}

export function runRefundEligibility(opts: {
  period: string;
  method?: "standard" | "simplified";
  deemedRate?: number;
  json?: boolean;
}): void {
  if (!opts.period) throw new Error("--period YYYY-MM is required");
  const summary = resolveAssessment(opts);
  const eligibility = assessConsumptionRefundEligibility({ summary });
  if (opts.json) {
    console.log(JSON.stringify(eligibility, null, 2));
    return;
  }
  console.log(formatConsumptionTaxEligibilityMarkdown(eligibility));
}

export function runRefundPropose(opts: {
  period: string;
  kind: ConsumptionTaxClaimKind;
  method?: "standard" | "simplified";
  deemedRate?: number;
  exceptionBasis?: string;
  json?: boolean;
}): void {
  requireRefundModuleEnabled();
  const file = loadClaimsFile();
  const open = findOpenClaim(file, opts.period);
  if (open) {
    throw new Error(`open claim already exists for ${opts.period}: ${open.id}`);
  }
  const claim = proposeClaimFromAssessment({
    summary: resolveAssessment(opts),
    kind: opts.kind,
    exceptionBasis: opts.exceptionBasis,
  });
  const next: ConsumptionRefundClaimsFile = {
    ...file,
    as_of: currentDate(),
    claims: [...file.claims.filter((row) => row.id !== claim.id), claim],
  };
  const dest = join(getModuleDataDir(MODULE_ID), CLAIMS_FILE);
  writeYamlFile(dest, next);
  if (opts.json) {
    console.log(JSON.stringify(claim, null, 2));
    return;
  }
  console.log(`✓ wrote ${claim.id} → ${dest}`);
}

export function runRefundPack(opts: { id: string; json?: boolean }): void {
  requireRefundModuleEnabled();
  const file = loadClaimsFile();
  const claim = file.claims.find((row) => row.id === opts.id);
  if (!claim) throw new Error(`claim not found: ${opts.id}`);
  assertPackable(claim);
  const md = formatRefundPackMarkdown(claim);
  if (opts.json) {
    console.log(JSON.stringify({ id: claim.id, markdown: md }, null, 2));
    return;
  }
  const dest = resolveTenantPath(`docs/company/tax/refund/${claim.id}.md`);
  writeTrackedFile(dest, md);
  console.log(`Wrote ${dest}`);
}

export function runRefundStatus(opts: { id: string; json?: boolean }): void {
  const file = loadClaimsFile();
  const claim = file.claims.find((row) => row.id === opts.id);
  if (!claim) throw new Error(`claim not found: ${opts.id}`);
  if (opts.json) {
    console.log(JSON.stringify(claim, null, 2));
    return;
  }
  console.log(formatRefundPackMarkdown(claim));
}

function persistClaims(file: ConsumptionRefundClaimsFile): string {
  const dest = join(getModuleDataDir(MODULE_ID), CLAIMS_FILE);
  writeYamlFile(dest, { ...file, as_of: currentDate() });
  return dest;
}

function requireClaim(id: string) {
  const file = loadClaimsFile();
  const claim = file.claims.find((row) => row.id === id);
  if (!claim) throw new Error(`claim not found: ${id}`);
  return { file, claim };
}

export function runRefundAdvance(opts: {
  id: string;
  to: "advisor_review" | "ready_to_file" | "rejected";
  json?: boolean;
}): void {
  requireRefundModuleEnabled();
  const { file, claim } = requireClaim(opts.id);
  const next = applyClaimStatus(claim, opts.to);
  const dest = persistClaims(replaceClaim(file, next));
  if (opts.json) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  console.log(`✓ ${next.id} ${claim.status} → ${next.status} (${dest})`);
}

export function runRefundFile(opts: { id: string; filedOn?: string; json?: boolean }): void {
  requireRefundModuleEnabled();
  requireCliHumanApproval("consumption-refund file");
  const { file, claim } = requireClaim(opts.id);
  const next = applyClaimStatus(claim, "filed_by_human", {
    filed_on: opts.filedOn ?? currentDate(),
  });
  const dest = persistClaims(replaceClaim(file, next));
  if (opts.json) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }
  console.log(`✓ ${next.id} filed_by_human on ${next.filed_on} (${dest})`);
}

export function runRefundReceive(opts: {
  id: string;
  receivedOn?: string;
  bankAccountId?: string;
  json?: boolean;
}): void {
  requireRefundModuleEnabled();
  const auth = requireCliFinanceReconciliationApproval("consumption-refund receive");
  const { file, claim } = requireClaim(opts.id);
  const receivedOn = opts.receivedOn ?? currentDate();
  const bankAccountId = opts.bankAccountId ?? claim.refund_bank_account_id;
  const accounts = resolveJournalSourceAccounts();
  if (!accounts.consumption_tax_receivable) {
    throw new Error("chart-of-accounts journal_source_accounts.consumption_tax_receivable is required");
  }
  const entry = buildRefundReceiveJournal({
    claim,
    receivedOn,
    bankAccountCode: accounts.bank_control,
    taxReceivableAccountCode: accounts.consumption_tax_receivable,
    bankAccountId,
  });
  appendJournalEntry(entry, { postedBy: auth.record.operator_id });
  const next = applyClaimStatus(claim, "received", {
    received_on: receivedOn,
    refund_bank_account_id: bankAccountId,
    journal_entry_id: entry.entry_id,
  });
  const dest = persistClaims(replaceClaim(file, next));
  if (opts.json) {
    console.log(JSON.stringify({ claim: next, journal: entry }, null, 2));
    return;
  }
  console.log(`✓ ${next.id} received ${next.amount_yen.toLocaleString()} JPY → ${entry.entry_id}`);
  console.log(`  ${dest}`);
}

export const REFUND_ADVANCE_TARGETS = [
  "advisor_review",
  "ready_to_file",
  "rejected",
] as const satisfies readonly ConsumptionRefundClaimStatus[];
