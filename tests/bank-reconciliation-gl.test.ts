import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  postBankReconciliationGl,
  resolveReconciliationSettleKind,
  reverseBankReconciliationGl,
} from "../src/lib/finance/bank-reconciliation-gl.js";
import { postMonthlyPlJournalEntries } from "../src/lib/finance/journal-sources.js";
import { buildSubsidiaryLedger } from "../src/lib/finance/ledger/subsidiary-ledger.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("bank reconciliation GL", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("resolves settle kind from bank direction and ar-ap kind", () => {
    expect(resolveReconciliationSettleKind({ bankDirection: "outflow" })).toBe("ap");
    expect(resolveReconciliationSettleKind({ bankDirection: "inflow" })).toBe("ar");
    expect(resolveReconciliationSettleKind({ arApKind: "ap" })).toBe("ap");
  });

  it("posts AR receipt and reverses via target event id", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const arBefore = buildSubsidiaryLedger({ accountCode: "1150", asOf: "2026-09-30" });
    const prop001 =
      arBefore.lines.find((row) => row.counterparty_id === "PROP-001")?.balance_yen ?? 0;
    expect(prop001).toBeGreaterThan(0);

    const eventId = "EVT-APPLY-AR-001";
    const posted = postBankReconciliationGl({
      eventId,
      kind: "ar",
      amountYen: prop001,
      counterpartyId: "PROP-001",
      occurredAt: "2026-09-29T12:00:00.000Z",
      authorizedBy: "OP-TEST",
    });
    expect(posted).toContain("JE-AR-");
    expect(
      Math.abs(
        buildSubsidiaryLedger({ accountCode: "1150", asOf: "2026-09-30" }).lines.find(
          (row) => row.counterparty_id === "PROP-001",
        )?.balance_yen ?? 0,
      ),
    ).toBe(0);

    const reversed = reverseBankReconciliationGl({
      targetEventId: eventId,
      authorizedBy: "OP-TEST",
      occurredAt: "2026-09-30T12:00:00.000Z",
    });
    expect(reversed).toBeTruthy();
    expect(
      loadJournalEntries().entries.some((row) => row.reversal_of === posted),
    ).toBe(true);
  });

  it("posts AP payment for outflow kind", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const apBefore = buildSubsidiaryLedger({ accountCode: "2110", asOf: "2026-09-30" });
    const prop002 =
      apBefore.lines.find((row) => row.counterparty_id === "PROP-002")?.balance_yen ?? 0;
    expect(prop002).toBeGreaterThan(0);
    postBankReconciliationGl({
      eventId: "EVT-APPLY-AP-001",
      kind: "ap",
      amountYen: prop002,
      counterpartyId: "PROP-002",
      occurredAt: "2026-09-29T12:00:00.000Z",
      authorizedBy: "OP-TEST",
    });
    expect(
      Math.abs(
        buildSubsidiaryLedger({ accountCode: "2110", asOf: "2026-09-30" }).lines.find(
          (row) => row.counterparty_id === "PROP-002",
        )?.balance_yen ?? 0,
      ),
    ).toBe(0);
  });
});
