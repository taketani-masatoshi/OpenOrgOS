import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  postApPaymentJournalEntry,
  postArReceiptJournalEntry,
  postMonthlyPlJournalEntries,
} from "../src/lib/finance/journal-sources.js";
import { buildSubsidiaryLedger } from "../src/lib/finance/ledger/subsidiary-ledger.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("AR/AP settlement GL loop", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("clears monthly AR/AP with receipt and payment journals", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });

    const arBefore = buildSubsidiaryLedger({ accountCode: "1150", asOf: "2026-09-30" });
    const apBefore = buildSubsidiaryLedger({ accountCode: "2110", asOf: "2026-09-30" });
    const prop001Ar =
      arBefore.lines.find((row) => row.counterparty_id === "PROP-001")?.balance_yen ?? 0;
    const prop002Ar =
      arBefore.lines.find((row) => row.counterparty_id === "PROP-002")?.balance_yen ?? 0;
    const prop002Ap =
      apBefore.lines.find((row) => row.counterparty_id === "PROP-002")?.balance_yen ?? 0;

    expect(prop001Ar).toBeGreaterThan(0);
    expect(prop002Ar).toBeGreaterThan(0);
    expect(prop002Ap).toBeGreaterThan(0);

    postArReceiptJournalEntry({
      ledgerEntryId: "SETTLE-RENT-202609",
      amountYen: prop001Ar,
      counterpartyId: "PROP-001",
      occurredAt: "2026-09-29T12:00:00.000Z",
      authorizedBy: "OP-TEST",
    });
    postArReceiptJournalEntry({
      ledgerEntryId: "SETTLE-HOTEL-202609",
      amountYen: prop002Ar,
      counterpartyId: "PROP-002",
      occurredAt: "2026-09-29T12:00:00.000Z",
      authorizedBy: "OP-TEST",
    });
    postApPaymentJournalEntry({
      ledgerEntryId: "SETTLE-OPEX-202609",
      amountYen: prop002Ap,
      counterpartyId: "PROP-002",
      occurredAt: "2026-09-29T12:00:00.000Z",
      authorizedBy: "OP-TEST",
    });

    const trial = buildTrialBalance({ asOf: "2026-09-30" });
    const arAfter = buildSubsidiaryLedger({ accountCode: "1150", asOf: "2026-09-30" });
    const apAfter = buildSubsidiaryLedger({ accountCode: "2110", asOf: "2026-09-30" });

    expect(arAfter.control_balance_yen).toBe(
      trial.rows.find((row) => row.account_code === "1150")?.balance_yen ?? 0,
    );
    expect(apAfter.control_balance_yen).toBe(
      trial.rows.find((row) => row.account_code === "2110")?.balance_yen ?? 0,
    );
    expect(arAfter.balanced).toBe(true);
    expect(apAfter.balanced).toBe(true);
    expect(Math.abs(arAfter.lines.find((row) => row.counterparty_id === "PROP-001")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(arAfter.lines.find((row) => row.counterparty_id === "PROP-002")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(apAfter.lines.find((row) => row.counterparty_id === "PROP-002")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(arAfter.control_balance_yen)).toBe(0);
    expect(Math.abs(apAfter.control_balance_yen)).toBe(0);
  });
});
