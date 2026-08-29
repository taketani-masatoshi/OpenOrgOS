import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { runProdAuthChecks } from "../console-auth/prod-checklist.js";
import { hasQualityRestoreDrill } from "./ledger-restore-drills.js";
import { isLegalDocumentationCounselSigned } from "./ledger-legal-attestation.js";
import { hasRecentSuccessfulSmtpMail } from "./ledger-mail.js";
import {
  isProductionEnv,
  isStripeBillingCommercialReady,
  isStripeBillingStubAllowed,
  stripeNextStepsDetail,
  stripeWebhookSecretConfigured,
} from "./stripe-ops.js";

function fileExists(rel: string): boolean {
  return existsSync(join(getInstallRoot(), rel));
}

function workspaceFile(rel: string): boolean {
  return existsSync(join(getWorkspaceRoot(), rel));
}

export type CommercialReadinessCheck = {
  id: string;
  gate: "C0" | "C1" | "C2" | "C3";
  label: string;
  weight: number;
  pass: boolean;
  detail?: string;
};

function sourceIncludes(rel: string, needles: string[]): boolean {
  const path = join(getInstallRoot(), rel);
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf-8");
  return needles.every((needle) => src.includes(needle));
}

export function buildCommercialReadinessChecks(): CommercialReadinessCheck[] {
  const checks: CommercialReadinessCheck[] = [
    {
      id: "commercial-mode",
      gate: "C0",
      label: "Commercial readiness module",
      weight: 2,
      pass: fileExists("src/lib/product/ledger-commercial-readiness.ts"),
    },
    {
      id: "dencho-claim-boundary",
      gate: "C0",
      label: "Dencho sales claim boundary doc",
      weight: 5,
      pass: fileExists("docs/product/dencho-sales-claim.md"),
    },
    {
      id: "prod-webhook-guard",
      gate: "C0",
      label: "Production blocks unsigned Stripe webhooks",
      weight: 5,
      pass:
        fileExists("src/lib/product/stripe-webhook.ts") &&
        (!isProductionEnv() || stripeWebhookSecretConfigured()),
      detail:
        isProductionEnv() && !stripeWebhookSecretConfigured()
          ? "ORGOS_ENV=production requires STRIPE_WEBHOOK_SECRET"
          : "ok",
    },
    {
      id: "prod-checkout-guard",
      gate: "C0",
      label: "Production blocks Stripe checkout stub",
      weight: 3,
      pass: !isProductionEnv() || isStripeBillingStubAllowed() === false,
      detail: isProductionEnv()
        ? "production requires STRIPE_SECRET_KEY (no checkout stub)"
        : "ok",
    },
    {
      id: "stripe-live",
      gate: "C1",
      label: "Stripe billing live keys present",
      weight: 8,
      pass: isStripeBillingCommercialReady(),
      detail: stripeNextStepsDetail(),
    },
    {
      id: "stripe-lifecycle",
      gate: "C1",
      label: "Stripe subscription lifecycle webhooks",
      weight: 6,
      pass: sourceIncludes("src/lib/product/stripe-webhook.ts", [
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.payment_failed",
        "invoice.paid",
      ]),
    },
    {
      id: "restore-script",
      gate: "C1",
      label: "Tenant restore script",
      weight: 5,
      pass: fileExists("scripts/restore-ledger-tenant.sh"),
    },
    {
      id: "restore-drill",
      gate: "C1",
      label: "Quality restore drill recorded",
      weight: 5,
      pass: hasQualityRestoreDrill(),
      detail: hasQualityRestoreDrill()
        ? "2 consecutive successes or ≥80% of last 5 (latest ok)"
        : "run restore drill twice successfully (single success is not enough)",
    },
    {
      id: "offboard-cli",
      gate: "C3",
      label: "Tenant offboard CLI",
      weight: 5,
      pass:
        fileExists("src/lib/product/ledger-tenant-offboard.ts") &&
        sourceIncludes("src/lib/product/ledger-tenant-offboard.ts", ["purgeDueLedgerTenants"]),
    },
    {
      id: "mail-outbox",
      gate: "C2",
      label: "Customer mail module present",
      weight: 2,
      pass: fileExists("src/lib/product/ledger-mail.ts"),
    },
    {
      id: "mail-smtp-drill",
      gate: "C2",
      label: "Recent successful SMTP mail drill",
      weight: 5,
      pass: hasRecentSuccessfulSmtpMail(),
      detail: hasRecentSuccessfulSmtpMail()
        ? "SMTP delivery within 30 days"
        : "configure ORGOS_MAIL_SMTP_URL and run orgos ledger product mail-drill",
    },
    {
      id: "prod-auth-checklist",
      gate: "C0",
      label: "Prod auth checklist (no false-green auth)",
      weight: 4,
      pass: runProdAuthChecks("all").every((row) => row.ok),
      detail: runProdAuthChecks("all")
        .filter((row) => !row.ok)
        .map((row) => row.id)
        .join(", ") || "ok",
    },
    {
      id: "onboarding-setup",
      gate: "C2",
      label: "Onboarding setup API",
      weight: 5,
      pass:
        fileExists("src/lib/product/ledger-onboarding-setup.ts") &&
        sourceIncludes("src/lib/steward-chat/routes/product-api.ts", [
          "/chat/v1/product/onboarding/setup",
        ]),
    },
    {
      id: "guest-invite",
      gate: "C2",
      label: "Guest operator invite tokens",
      weight: 4,
      pass:
        fileExists("src/lib/product/ledger-guest-invite.ts") &&
        fileExists("apps/steward-chat/src/GuestSetupPage.tsx") &&
        sourceIncludes("src/lib/steward-chat/routes/product-api.ts", [
          "/chat/v1/product/guest-setup",
        ]),
    },
    {
      id: "billing-issues",
      gate: "C3",
      label: "Billing issues fleet report",
      weight: 4,
      pass: sourceIncludes("src/lib/product/ledger-billing-issues.ts", [
        "buildBillingIssuesReport",
      ]) && sourceIncludes("src/lib/product/ledger-ops-dashboard.ts", [
        "billing_issues",
      ]),
    },
    {
      id: "fleet-monitor",
      gate: "C2",
      label: "Fleet monitor CLI",
      weight: 4,
      pass:
        fileExists("src/lib/product/ledger-monitor.ts") &&
        sourceIncludes("src/commands/ledger-product.ts", ["runFleetMonitor"]),
    },
    {
      id: "support-ssot",
      gate: "C3",
      label: "Support contact SSOT + status page",
      weight: 3,
      pass: (() => {
        if (!workspaceFile("product-fleet/support.yaml")) return false;
        try {
          const body = readFileSync(join(getWorkspaceRoot(), "product-fleet/support.yaml"), "utf-8");
          return /status_page_url:\s*\S+/.test(body) && fileExists("docs/product/status.md");
        } catch {
          return false;
        }
      })(),
      detail: "product-fleet/support.yaml must set status_page_url; docs/product/status.md required",
    },
    {
      id: "accountant-channel",
      gate: "C2",
      label: "Accountant fleet channel module",
      weight: 3,
      pass: fileExists("src/lib/product/ledger-accountant-channel.ts"),
    },
    {
      id: "legal-signed",
      gate: "C3",
      label: "Legal ToS/DPA counsel-reviewed",
      weight: 4,
      pass: isLegalDocumentationCounselSigned(),
      detail: isLegalDocumentationCounselSigned()
        ? "counsel review recorded"
        : "set counsel_reviewed_* or signed_by counsel-* via legal-attest",
    },
  ];

  return checks;
}

export function buildCommercialReadinessReport() {
  const checks = buildCommercialReadinessChecks();
  const weighted = checks.filter((row) => row.weight > 0);
  const earned = weighted
    .filter((row) => row.pass)
    .reduce((sum, row) => sum + row.weight, 0);
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

  let gate = "C0";
  if (score >= 100) gate = "C3";
  else if (score >= 95) gate = "C2";
  else if (score >= 85) gate = "C1";
  else if (score >= 70) gate = "C0";

  return {
    score,
    max_score: 100 as const,
    gate_estimate: gate,
    mode: "commercial" as const,
    checked_at: new Date().toISOString(),
    checks,
  };
}
