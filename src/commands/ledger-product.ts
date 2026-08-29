import {
  createLedgerSignup,
  findLedgerSignup,
  listFleetTenantStatus,
  listLedgerSignups,
  setLedgerSignupStatus,
} from "../lib/product/ledger-fleet.js";
import { buildFleetHealthReport } from "../lib/product/ledger-fleet-health.js";
import { listLedgerPlans, resolveLedgerPlan } from "../lib/product/ledger-plans.js";
import { buildProductReadinessReport } from "../lib/product/ledger-product-readiness.js";
import { buildCommercialReadinessReport } from "../lib/product/ledger-commercial-readiness.js";
import { hydrateStripeEnvFromStore } from "../lib/product/stripe-secrets-store.js";
import { buildAccountingReadinessReport } from "../lib/product/ledger-accounting-readiness.js";
import { buildCustomerUxReadinessReport } from "../lib/product/ledger-customer-ux-readiness.js";
import { provisionLedgerTenant } from "../lib/product/ledger-provision.js";
import { loadLedgerSubscription } from "../lib/product/ledger-subscription.js";
import { exportLedgerTenantArchive } from "../lib/product/ledger-tenant-export.js";
import { createLedgerCheckoutSession } from "../lib/product/stripe-checkout.js";
import {
  linkAccountantClient,
  loadControlPlane,
  syncControlPlaneFromProductTenants,
} from "../lib/product/ledger-control-plane.js";
import { buildOnboardingReport } from "../lib/product/ledger-onboarding.js";
import {
  buildAccountantFleetSnapshot,
  buildOpsDashboardSnapshot,
} from "../lib/product/ledger-ops-dashboard.js";
import { buildBillingIssuesReport } from "../lib/product/ledger-billing-issues.js";
import { restoreLedgerTenantArchive, validateLedgerProductTenant } from "../lib/product/ledger-tenant-restore.js";
import { offboardLedgerTenant, purgeDueLedgerTenants } from "../lib/product/ledger-tenant-offboard.js";
import { recordRestoreDrill } from "../lib/product/ledger-restore-drills.js";
import { runFleetMonitor } from "../lib/product/ledger-monitor.js";
import { listLedgerMailOutbox, runLedgerMailDrill } from "../lib/product/ledger-mail.js";
import { seedLedgerDemoYear } from "../lib/product/ledger-seed-demo-year.js";
import { buildTaxHandoffPackage } from "../lib/tax/tax-handoff-package.js";
import { buildTaxReadinessReport } from "../lib/product/ledger-tax-readiness.js";
import {
  attestStripeBilling,
  buildStripeBillingStatus,
} from "../lib/product/stripe-ops.js";
import { attestLegalDocumentation } from "../lib/product/ledger-legal-attestation.js";
import type { LedgerPlanId } from "../../schemas/product/ledger-product.js";
import { join } from "node:path";
import { getInstallRoot, getTenantsDir } from "../lib/orgos-paths.js";

export function runLedgerProductPlans(): void {
  console.log(JSON.stringify({ plans: listLedgerPlans() }, null, 2));
}

export async function runLedgerProductSignup(opts: {
  companyName: string;
  adminEmail: string;
  plan?: string;
  tenantId?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<void> {
  const plan = resolveLedgerPlan(opts.plan ?? "starter");
  const signup = createLedgerSignup({
    tenantId:
      opts.tenantId ??
      opts.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24),
    companyName: opts.companyName,
    adminEmail: opts.adminEmail,
    plan: plan.id,
  });
  const checkout = await createLedgerCheckoutSession({
    signupId: signup.signup_id,
    email: signup.admin_email,
    plan,
    successUrl: opts.successUrl ?? `http://localhost:9470/signup?success=1`,
    cancelUrl: opts.cancelUrl ?? `http://localhost:9470/signup?cancelled=1`,
  });
  console.log(
    JSON.stringify(
      {
        signup_id: signup.signup_id,
        tenant_id: signup.tenant_id,
        checkout_url: checkout.url,
        checkout_mode: checkout.mode,
      },
      null,
      2,
    ),
  );
}

export function runLedgerProductProvision(opts: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan?: string;
}): void {
  const result = provisionLedgerTenant({
    tenantId: opts.tenantId,
    companyName: opts.companyName,
    adminEmail: opts.adminEmail,
    plan: (opts.plan ?? "starter") as LedgerPlanId,
  });
  console.log(`✓ Provisioned ledger tenant ${result.tenant_id} at ${result.path}`);
}

export function runLedgerProductActivateSignup(opts: { signupId: string }): void {
  const signup = findLedgerSignup(opts.signupId);
  if (!signup) throw new Error(`Signup not found: ${opts.signupId}`);
  provisionLedgerTenant({
    tenantId: signup.tenant_id,
    companyName: signup.company_name,
    adminEmail: signup.admin_email,
    plan: signup.plan,
    stripeCustomerId: signup.stripe_customer_id,
  });
  setLedgerSignupStatus(signup.signup_id, "provisioned");
  console.log(`✓ Activated signup ${signup.signup_id} → tenants/${signup.tenant_id}`);
}

export function runLedgerProductFleetStatus(opts?: { productOnly?: boolean }): void {
  console.log(
    JSON.stringify(
      {
        signups: listLedgerSignups(),
        tenants: listFleetTenantStatus({ productOnly: opts?.productOnly }),
      },
      null,
      2,
    ),
  );
}

export function runLedgerProductFleetHealth(opts?: { json?: boolean }): void {
  const report = buildFleetHealthReport();
  if (opts?.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `Fleet health @ ${report.checked_at}: ${report.healthy_count}/${report.tenant_count} healthy`,
  );
  for (const row of report.tenants) {
    const flags = [
      row.validate_ok ? "validate:ok" : `validate:fail(${row.error_count})`,
      row.has_ceo ? "ceo:ok" : "ceo:missing",
      row.trial_expired ? "trial:expired" : null,
      row.subscription_status === "past_due" ? "billing:past_due" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${row.tenant_id} — ${flags}`);
  }
  if (report.signups_pending > 0) {
    console.log(`  pending signups: ${report.signups_pending}`);
  }
}

export function runLedgerProductReadiness(opts?: {
  json?: boolean;
  commercial?: boolean;
  accounting?: boolean;
  customerUx?: boolean;
}): void {
  if (opts?.customerUx) {
    const report = buildCustomerUxReadinessReport();
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(
      `Customer UX readiness: ${report.score}/100 (all axes ≥90: ${report.all_axes_ge_90 ? "yes" : "no"})`,
    );
    for (const [axis, row] of Object.entries(report.axis_scores)) {
      console.log(
        `  axis ${axis}: ${row.score}/100 ${row.pass ? "✓" : "·"}`,
      );
    }
    for (const check of report.checks.filter((row) => row.weight > 0)) {
      console.log(
        `  [${check.pass ? "✓" : "·"}] ${check.id} (${check.axis}) — ${check.label}${check.detail ? ` — ${check.detail}` : ""}`,
      );
    }
    return;
  }

  if (opts?.accounting) {
    const report = buildAccountingReadinessReport();
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(
      `Accounting commercial readiness: ${report.score}/100 (gate ~${report.gate_estimate})`,
    );
    for (const check of report.checks.filter((row) => row.weight > 0)) {
      console.log(
        `  [${check.pass ? "✓" : "·"}] ${check.id} (${check.gate}) — ${check.label}${check.detail ? ` — ${check.detail}` : ""}`,
      );
    }
    return;
  }

  if (opts?.commercial) {
    hydrateStripeEnvFromStore();
    const report = buildCommercialReadinessReport();
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(
      `Commercial readiness: ${report.score}/100 (gate ~${report.gate_estimate})`,
    );
    for (const check of report.checks.filter((row) => row.weight > 0)) {
      console.log(
        `  [${check.pass ? "✓" : "·"}] ${check.id} (${check.gate}) — ${check.label}${check.detail ? ` — ${check.detail}` : ""}`,
      );
    }
    return;
  }

  const report = buildProductReadinessReport({ mode: "product" });
  if (opts?.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `Product readiness: ${report.score}/100 (phase ~${report.phase_estimate})`,
  );
  for (const check of report.checks.filter((row) => row.weight > 0)) {
    console.log(
      `  [${check.pass ? "✓" : "·"}] ${check.id} (${check.phase}) — ${check.label}${check.detail ? ` — ${check.detail}` : ""}`,
    );
  }
}

export function runLedgerProductExport(opts: {
  tenantId?: string;
  output?: string;
}): void {
  const tenantId = opts.tenantId ?? process.env.ORGOS_TENANT;
  if (!tenantId) throw new Error("tenant id required (--tenant-id or ORGOS_TENANT)");
  const output =
    opts.output ??
    join(getInstallRoot(), "exports", `${tenantId}-${Date.now()}.tar.gz`);
  const result = exportLedgerTenantArchive({ tenantId, outputPath: output });
  console.log(`✓ Exported ${result.manifest.tenant_id} → ${result.path}`);
}

export function runLedgerProductSubscription(): void {
  const sub = loadLedgerSubscription();
  console.log(JSON.stringify({ subscription: sub }, null, 2));
}

export function runLedgerProductControlPlane(opts?: { sync?: boolean }): void {
  if (opts?.sync) syncControlPlaneFromProductTenants();
  console.log(JSON.stringify(loadControlPlane(), null, 2));
}

export function runLedgerProductOnboarding(): void {
  console.log(JSON.stringify(buildOnboardingReport(), null, 2));
}

export function runLedgerProductOpsDashboard(): void {
  console.log(JSON.stringify(buildOpsDashboardSnapshot(), null, 2));
}

export function runLedgerProductTaxReadiness(): void {
  console.log(JSON.stringify(buildTaxReadinessReport(), null, 2));
}

export function runLedgerProductLinkAccountant(opts: {
  clientTenantId: string;
  accountantTenantId: string;
}): void {
  linkAccountantClient({
    clientTenantId: opts.clientTenantId,
    accountantTenantId: opts.accountantTenantId,
  });
  console.log(
    `✓ Linked ${opts.clientTenantId} → accountant ${opts.accountantTenantId}`,
  );
}

export function runLedgerProductStripeStatus(opts?: { json?: boolean }): void {
  const status = buildStripeBillingStatus();
  if (opts?.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(
    `Stripe billing: mode=${status.mode} · ops_path=${status.ops_path_ready ? "ok" : "missing"} · live_ready=${status.live_ready ? "yes" : "no"}`,
  );
  console.log(`  secret: ${status.secret_configured ? "set" : "missing"}`);
  console.log(
    `  webhook_secret: ${status.webhook_secret_configured ? "set" : "missing"}`,
  );
  console.log(
    `  attestation: ${status.attestation.status} (${status.attestation.mode})`,
  );
}

export function runLedgerProductStripeAttest(opts?: { note?: string }): void {
  const record = attestStripeBilling({ note: opts?.note });
  console.log(
    `✓ Stripe billing attested · mode=${record.mode} · status=${record.status}`,
  );
}

export function runLedgerProductLegalAttest(opts: {
  signedBy: string;
  document?: string;
  note?: string;
  counselReviewedBy?: string;
}): void {
  const record = attestLegalDocumentation({
    signedBy: opts.signedBy,
    documentPath: opts.document,
    note: opts.note,
    counselReviewed: Boolean(opts.counselReviewedBy) || undefined,
    counselReviewedBy: opts.counselReviewedBy,
  });
  console.log(
    `✓ Legal attestation recorded · document=${record.document_path} · signed_at=${record.signed_at}`,
  );
}

export function runLedgerProductBillingIssues(opts?: { json?: boolean }): void {
  const report = buildBillingIssuesReport();
  if (opts?.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (report.issues.length === 0) {
    console.log("No billing issues.");
    return;
  }
  for (const row of report.issues) {
    console.log(`  ${row.tenant_id} — ${row.issue}: ${row.detail}`);
  }
}

export async function runLedgerProductRestore(opts: {
  tenantId: string;
  archive: string;
  force?: boolean;
}): Promise<void> {
  const result = restoreLedgerTenantArchive({
    tenantId: opts.tenantId,
    archivePath: opts.archive,
    force: opts.force,
  });
  console.log(
    `✓ Restored ${result.tenant_id} → ${result.path} (validate: ${result.validate_ok ? "ok" : "fail"})`,
  );
}

export function runLedgerProductOffboard(opts: {
  tenantId: string;
  exportFirst?: boolean;
  output?: string;
  purge?: boolean;
  purgeNow?: boolean;
  graceDays?: number;
}): void {
  const result = offboardLedgerTenant({
    tenantId: opts.tenantId,
    exportFirst: opts.exportFirst,
    outputPath: opts.output,
    purge: opts.purge,
    purgeNow: opts.purgeNow,
    graceDays: opts.graceDays,
  });
  const purgeNote =
    result.status === "purge_scheduled" && result.purge_after
      ? ` purge_after=${result.purge_after}`
      : "";
  console.log(
    `✓ Offboarded ${result.tenant_id} (${result.status})${result.exported_path ? ` export=${result.exported_path}` : ""}${purgeNote}`,
  );
}

export function runLedgerProductPurgeDue(): void {
  const purged = purgeDueLedgerTenants();
  if (purged.length === 0) {
    console.log("No tenants due for purge.");
    return;
  }
  console.log(`✓ Purged ${purged.length} tenant(s): ${purged.join(", ")}`);
}

export function runLedgerProductRestoreDrill(opts: {
  tenantId: string;
  archive: string;
}): void {
  const drillTenantId = `${opts.tenantId}-drill`;
  const result = restoreLedgerTenantArchive({
    tenantId: drillTenantId,
    archivePath: opts.archive,
    force: true,
  });
  const ledgerValidated = validateLedgerProductTenant(drillTenantId);
  recordRestoreDrill({
    tenantId: opts.tenantId,
    archivePath: opts.archive,
    ok: ledgerValidated,
    validated: ledgerValidated,
    note: `drill restore to ${drillTenantId} · full validate=${result.validate_ok ? "ok" : "warn"}`,
  });
  console.log(
    `✓ Restore drill recorded for ${opts.tenantId} (ledger validate: ${ledgerValidated ? "ok" : "fail"})`,
  );
}

export async function runLedgerProductMonitor(opts?: {
  json?: boolean;
  failOnUnhealthy?: boolean;
}): Promise<void> {
  const snapshot = await runFleetMonitor({
    failOnUnhealthy: opts?.failOnUnhealthy,
  });
  if (opts?.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(
    `Fleet monitor: ${snapshot.healthy ? "healthy" : "UNHEALTHY"} · ${snapshot.fleet.healthy_count}/${snapshot.fleet.tenant_count}`,
  );
  if (snapshot.billing_issues.issues.length > 0) {
    console.log(`  billing issues: ${snapshot.billing_issues.issues.length}`);
  }
}

export function runLedgerProductMailOutbox(opts?: { json?: boolean }): void {
  const messages = listLedgerMailOutbox();
  if (opts?.json) {
    console.log(JSON.stringify({ messages }, null, 2));
    return;
  }
  for (const row of messages.slice(-20)) {
    console.log(`  ${row.sent_at} ${row.kind} → ${row.to}`);
  }
}

export function runLedgerProductSeedDemoYear(opts?: {
  fiscalYear?: string;
  force?: boolean;
  json?: boolean;
}): void {
  const result = seedLedgerDemoYear({
    fiscalYear: opts?.fiscalYear,
    force: opts?.force,
  });
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.skipped) {
    console.log("Skipped — journals already present (pass --force to re-seed)");
    return;
  }
  console.log(
    `✓ Seeded ${result.posted_entry_ids.length} demo entries for ${result.fiscal_year} (${result.months.length} months)`,
  );
}

export function runTaxModuleHandoffPackage(opts?: {
  fiscalYear?: string;
  json?: boolean;
}): void {
  const pack = buildTaxHandoffPackage({ fiscalYear: opts?.fiscalYear });
  if (opts?.json) {
    console.log(JSON.stringify(pack, null, 2));
    return;
  }
  console.log(`✓ Tax handoff package → ${pack.zip_path}`);
}

export async function runLedgerProductMailDrill(opts: { to: string; json?: boolean }): Promise<void> {
  const result = await runLedgerMailDrill(opts.to);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Mail drill ${result.status} via ${result.transport} · id=${result.id}`);
}
