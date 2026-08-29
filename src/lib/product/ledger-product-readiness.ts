import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { buildFleetHealthReport } from "./ledger-fleet-health.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import {
  isStripeBillingOpsPathReady,
  stripeNextStepsDetail,
} from "./stripe-ops.js";
import { buildCommercialReadinessReport } from "./ledger-commercial-readiness.js";

export type ReadinessCheck = {
  id: string;
  phase: "P0" | "P1" | "P2" | "P3" | "P4";
  label: string;
  weight: number;
  pass: boolean;
  detail?: string;
};

export type ProductReadinessMode = "product" | "commercial";

export type ProductReadinessReport = {
  score: number;
  max_score: 100;
  phase_estimate: string;
  mode: ProductReadinessMode;
  checked_at: string;
  checks: ReadinessCheck[];
  fleet: ReturnType<typeof buildFleetHealthReport>;
  commercial?: ReturnType<typeof buildCommercialReadinessReport>;
};

function fileExists(rel: string): boolean {
  return existsSync(join(getInstallRoot(), rel));
}

export function buildProductReadinessReport(
  opts?: { mode?: ProductReadinessMode },
): ProductReadinessReport {
  const mode = opts?.mode ?? "product";
  const checks: ReadinessCheck[] = [
    {
      id: "adr-0058",
      phase: "P0",
      label: "ADR 0058 product layer",
      weight: 3,
      pass: fileExists("docs/adr/0058-orgos-ledger-product-layer.md"),
    },
    {
      id: "product-docs",
      phase: "P0",
      label: "docs/product runbook + security",
      weight: 3,
      pass:
        fileExists("docs/product/README.md") &&
        fileExists("docs/product/security-overview.md"),
    },
    {
      id: "ledger-docker",
      phase: "P0",
      label: "Managed single-tenant compose",
      weight: 3,
      pass: fileExists("deploy/product/docker-compose.ledger.yaml"),
    },
    {
      id: "dencho",
      phase: "P0",
      label: "Electronic ledger module",
      weight: 4,
      pass: fileExists("src/lib/finance/ledger/electronic-ledger.ts"),
    },
    {
      id: "http-export",
      phase: "P0",
      label: "HTTP ledger export",
      weight: 3,
      pass: fileExists("src/lib/steward-chat/routes/ledger-api.ts"),
    },
    {
      id: "stripe-checkout",
      phase: "P1",
      label: "Stripe checkout integration",
      weight: 4,
      pass: fileExists("src/lib/product/stripe-checkout.ts"),
    },
    {
      id: "signup-api",
      phase: "P1",
      label: "Self-service signup API",
      weight: 4,
      pass: fileExists("src/lib/steward-chat/routes/product-api.ts"),
    },
    {
      id: "provision-cli",
      phase: "P1",
      label: "Provision script + CLI",
      weight: 4,
      pass: fileExists("scripts/provision-ledger-tenant.sh"),
    },
    {
      id: "fleet-registry",
      phase: "P1",
      label: "Fleet signup registry",
      weight: 3,
      pass: fileExists("src/lib/product/ledger-fleet.ts"),
    },
    {
      id: "customer-admin",
      phase: "P2",
      label: "Customer admin UI + API",
      weight: 5,
      pass: fileExists("apps/steward-chat/src/CustomerAdminPage.tsx"),
    },
    {
      id: "sla-doc",
      phase: "P2",
      label: "Customer SLA document",
      weight: 3,
      pass: fileExists("docs/product/sla.md"),
    },
    {
      id: "fleet-health",
      phase: "P2",
      label: "Fleet health checks",
      weight: 4,
      pass: fileExists("src/lib/product/ledger-fleet-health.ts"),
    },
    {
      id: "tenant-export",
      phase: "P2",
      label: "Tenant data export (portability)",
      weight: 4,
      pass: fileExists("src/lib/product/ledger-tenant-export.ts"),
    },
    {
      id: "plan-limits",
      phase: "P2",
      label: "Plan usage limits",
      weight: 3,
      pass: fileExists("src/lib/product/ledger-usage.ts"),
    },
    {
      id: "backup-script",
      phase: "P2",
      label: "Fleet backup script",
      weight: 3,
      pass: fileExists("scripts/backup-ledger-fleet.sh"),
    },
    {
      id: "stripe-live",
      phase: "P1",
      label: "Stripe billing ops path",
      weight: 2,
      pass: false,
      detail: "computed below",
    },
    {
      id: "tenant-rate-limit",
      phase: "P3",
      label: "Per-tenant HTTP rate limits",
      weight: 2,
      pass: fileExists("src/lib/console-auth/rate-limit.ts"),
      detail: "X-OrgOS-Tenant / host keyed quotas",
    },
    {
      id: "etax-xml-draft",
      phase: "P4",
      label: "Corporate tax XML draft (5b handoff)",
      weight: 2,
      pass: fileExists("src/lib/finance/jp-corporate-tax-xml.ts"),
      detail: "Advisor handoff only — not e-Tax submit",
    },
    {
      id: "ledger-tenants",
      phase: "P1",
      label: "At least one ledger tenant provisioned",
      weight: 3,
      pass: listLedgerProductTenantIds().length >= 1,
      detail: `${listLedgerProductTenantIds().length} tenant(s)`,
    },
    {
      id: "fleet-five",
      phase: "P2",
      label: "Five ledger tenants (P2 gate)",
      weight: 5,
      pass: listLedgerProductTenantIds().length >= 5,
      detail: `${listLedgerProductTenantIds().length}/5`,
    },
    {
      id: "fleet-all-healthy",
      phase: "P2",
      label: "All ledger tenants validate",
      weight: 5,
      pass: false,
      detail: "computed below",
    },
    {
      id: "control-plane",
      phase: "P3",
      label: "Shared control plane registry",
      weight: 5,
      pass: fileExists("src/lib/product/ledger-control-plane.ts"),
    },
    {
      id: "tenant-routing",
      phase: "P3",
      label: "HTTP tenant routing (host / header)",
      weight: 4,
      pass: fileExists("docs/product/control-plane.md"),
    },
    {
      id: "ops-dashboard",
      phase: "P3",
      label: "Fleet ops dashboard",
      weight: 4,
      pass: fileExists("src/lib/product/ledger-ops-dashboard.ts"),
    },
    {
      id: "onboarding-wizard",
      phase: "P4",
      label: "Onboarding checklist UI",
      weight: 4,
      pass: fileExists("apps/steward-chat/src/OnboardingPage.tsx"),
    },
    {
      id: "cash-flow",
      phase: "P4",
      label: "Cash flow statement (CF)",
      weight: 4,
      pass: fileExists("src/lib/finance/ledger/cash-flow-statement.ts"),
    },
    {
      id: "accountant-channel",
      phase: "P4",
      label: "Accountant multi-client fleet",
      weight: 4,
      pass: fileExists("src/lib/product/ledger-accountant-channel.ts"),
    },
    {
      id: "etax-module",
      phase: "P4",
      label: "e-Tax module registered (optional SKU)",
      weight: 2,
      pass: fileExists(
        "steward/jurisdiction-packs/JP/modules/jp_tax_corporate/module.manifest.yaml",
      ),
      detail: "Separate module per ADR 0052",
    },
    {
      id: "tax-readiness",
      phase: "P4",
      label: "Statutory tax readiness API",
      weight: 3,
      pass: fileExists("src/lib/product/ledger-tax-readiness.ts"),
    },
    {
      id: "tenant-isolation-test",
      phase: "P3",
      label: "Cross-tenant isolation test",
      weight: 3,
      pass: fileExists("tests/ledger-tenant-isolation.test.ts"),
    },
  ];

  const fleet = buildFleetHealthReport();
  const allHealthy =
    fleet.tenant_count > 0 &&
    fleet.healthy_count === fleet.tenant_count;
  const healthCheck = checks.find((row) => row.id === "fleet-all-healthy");
  if (healthCheck) {
    healthCheck.pass = allHealthy;
    healthCheck.detail = `${fleet.healthy_count}/${fleet.tenant_count} healthy (${fleet.scope})`;
  }

  const stripeCheck = checks.find((row) => row.id === "stripe-live");
  if (stripeCheck) {
    const opsReady = isStripeBillingOpsPathReady();
    stripeCheck.pass = opsReady;
    stripeCheck.detail = opsReady
      ? stripeNextStepsDetail()
      : "missing stripe.md / .env.ledger.example / stripe-ops";
  }

  const weighted = checks.filter((row) => row.weight > 0);
  const earned = weighted
    .filter((row) => row.pass)
    .reduce((sum, row) => sum + row.weight, 0);
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  const score = Math.round((earned / total) * 100);

  let phaseEstimate = "P0";
  if (score >= 93) phaseEstimate = "P4";
  else if (score >= 85) phaseEstimate = "P3";
  else if (score >= 72) phaseEstimate = "P2";
  else if (score >= 58) phaseEstimate = "P1";

  return {
    score,
    max_score: 100,
    phase_estimate: phaseEstimate,
    mode,
    checked_at: new Date().toISOString(),
    checks,
    fleet,
    commercial: mode === "commercial" ? buildCommercialReadinessReport() : undefined,
  };
}
