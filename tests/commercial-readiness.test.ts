import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { buildCommercialReadinessReport } from "../src/lib/product/ledger-commercial-readiness.js";
import { attestStripeBilling } from "../src/lib/product/stripe-ops.js";
import { recordRestoreDrill } from "../src/lib/product/ledger-restore-drills.js";
import { attestLegalDocumentation } from "../src/lib/product/ledger-legal-attestation.js";
import { runLedgerMailDrill } from "../src/lib/product/ledger-mail.js";

describe("commercial readiness", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("scores below 100 without live stripe and legal sign-off", () => {
    workspace = mkdtempSync(join(tmpdir(), "commercial-ready-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.ORGOS_MAIL_SMTP_URL;
    delete process.env.ORGOS_LEDGER_SMTP_URL;
    refreshOrgOsPaths();
    const report = buildCommercialReadinessReport();
    expect(report.score).toBeLessThan(100);
    expect(report.checks.find((row) => row.id === "stripe-live")?.pass).toBe(false);
    expect(report.checks.find((row) => row.id === "stripe-live")?.detail).toContain(
      "STRIPE_SECRET_KEY",
    );
    expect(report.checks.find((row) => row.id === "legal-signed")?.pass).toBe(false);
  });

  it("rejects attestation-only stripe for commercial stripe-live", () => {
    workspace = mkdtempSync(join(tmpdir(), "commercial-attest-only-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    refreshOrgOsPaths();
    attestStripeBilling({ note: "temp" });
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const report = buildCommercialReadinessReport();
    expect(report.checks.find((row) => row.id === "stripe-live")?.pass).toBe(false);
  });

  it("passes stripe/legal/mail/restore commercial gates when fully wired", async () => {
    workspace = mkdtempSync(join(tmpdir(), "commercial-ready-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    process.env.ORGOS_MAIL_SMTP_URL = "smtp://user:pass@127.0.0.1:2525";
    process.env.ORGOS_MAIL_SMTP_MOCK = "1";
    refreshOrgOsPaths();
    attestStripeBilling({ note: "test" });
    recordRestoreDrill({
      tenantId: "pilot-ledger-001",
      archivePath: "/tmp/export-1.tar.gz",
      ok: true,
      validated: true,
    });
    recordRestoreDrill({
      tenantId: "pilot-ledger-001",
      archivePath: "/tmp/export-2.tar.gz",
      ok: true,
      validated: true,
    });
    await runLedgerMailDrill("ops@example.com");
    attestLegalDocumentation({
      signedBy: "counsel-external",
      counselReviewed: true,
      counselReviewedBy: "counsel-external",
      note: "test counsel",
    });
    const report = buildCommercialReadinessReport();
    expect(report.checks.find((row) => row.id === "stripe-live")?.pass).toBe(true);
    expect(report.checks.find((row) => row.id === "restore-drill")?.pass).toBe(true);
    expect(report.checks.find((row) => row.id === "mail-smtp-drill")?.pass).toBe(true);
    expect(report.checks.find((row) => row.id === "legal-signed")?.pass).toBe(true);
  });
});
