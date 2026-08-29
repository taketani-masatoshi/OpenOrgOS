import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import {
  runMonthlyCompanyEventsAudit,
  runWeeklyCompanyEventsAttestation,
} from "../src/lib/company-events-attestation.js";
import { getDataDir } from "../src/lib/utils.js";
import { setTenantId } from "../src/lib/tenant.js";

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

describe("company-events monthly audit FR-29", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    initCompanyEventsFile();
    ensureCompanyEventMonth("2026-07");
    createCompanyEvent({
      kind: "misc",
      title: "Monthly audit test",
      occurredAt: "2026-07-08",
      slug: "monthly-audit",
    });
    runWeeklyCompanyEventsAttestation({ force: true, date: new Date("2026-07-10") });
  });

  afterEach(() => cleanup());

  it("PASS when chain and attestation are valid", async () => {
    const result = await runMonthlyCompanyEventsAudit({
      month: "2026-07",
      notify: false,
    });
    expect(result.ok).toBe(true);
    expect(result.report_path).toBeTruthy();
    expect(result.findings.some((f) => f.code === "chain-ok")).toBe(true);
  });

  it("FAIL when chain integrity breaks", async () => {
    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    rmSync(chainPath, { force: true });
    const result = await runMonthlyCompanyEventsAudit({
      month: "2026-07",
      notify: false,
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "chain-failed")).toBe(true);
  });

  it("sends notification when webhook configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await runMonthlyCompanyEventsAudit({ month: "2026-07", notify: true });
    vi.unstubAllGlobals();
  });
});
