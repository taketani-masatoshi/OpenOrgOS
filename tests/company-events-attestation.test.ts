import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import {
  assertCompanyEventsChainIntegrity,
  loadCompanyEventsAttestations,
  runWeeklyCompanyEventsAttestation,
  verifyCompanyEventsAttestation,
} from "../src/lib/company-events-attestation.js";

function cleanup(): void {
  for (const name of [
    "company-events.yaml",
    "company-events-chain.jsonl",
    "company-events-attestations.jsonl",
    "company-events-signing-meta.yaml",
  ]) {
    const p = join(getDataDir(), name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  const orgosDir = join(getDataDir(), ".orgos");
  if (existsSync(orgosDir)) rmSync(orgosDir, { recursive: true, force: true });
}

describe("company-events attestation", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");
    createCompanyEvent({
      kind: "misc",
      title: "Attest test event",
      occurredAt: "2026-07-08",
      slug: "attest-test",
    });
  });

  afterEach(() => cleanup());

  it("assertCompanyEventsChainIntegrity passes on valid chain", () => {
    const result = assertCompanyEventsChainIntegrity();
    expect(result.ok).toBe(true);
    expect(result.chain_checked).toBeGreaterThan(0);
  });

  it("weekly attestation signs after chain verify", () => {
    const { attestation, skipped } = runWeeklyCompanyEventsAttestation({ force: true });
    expect(skipped).toBeFalsy();
    expect(attestation.attestation_id).toMatch(/^CEA-\d{4}-W\d{2}$/);
    expect(attestation.chain_ok).toBe(true);
    expect(verifyCompanyEventsAttestation(attestation).ok).toBe(true);

    const stored = loadCompanyEventsAttestations();
    expect(stored.some((a) => a.attestation_id === attestation.attestation_id)).toBe(true);
  });

  it("rejects tampered attestation signature", () => {
    const { attestation } = runWeeklyCompanyEventsAttestation({ force: true });
    const tampered = { ...attestation, chain_checked: attestation.chain_checked + 1 };
    expect(verifyCompanyEventsAttestation(tampered).ok).toBe(false);
  });

  it("skips duplicate weekly attestation without force", () => {
    runWeeklyCompanyEventsAttestation({ force: true });
    const second = runWeeklyCompanyEventsAttestation();
    expect(second.skipped).toBe(true);
  });
});
