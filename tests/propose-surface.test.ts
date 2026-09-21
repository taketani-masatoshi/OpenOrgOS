/** @catalog-ids: field_ops, client_portal, hr_lifecycle */
import { describe, expect, it } from "vitest";
import { journalEntryLineSchema } from "../schemas/finance/journal-entry.js";
import { validateModuleAiDeclaration } from "../src/lib/module-ai-declaration.js";
import {
  analyzeFieldTime,
  assertNoHrSecretFields,
  bridgeEventIndex,
  buildAuditPackIndex,
  buildDailyCashSeries,
  draftLostDealFollowup,
  extractBant,
  findSodConflicts,
  issuePortalGrant,
  issueTrackingUrl,
  matchRegistration,
  parseInvoiceFixture,
  proposeConsumption,
  proposeDispatch,
  proposeExpenseIntake,
  proposeJobCompletion,
  proposePayrollTransfer,
  proposeReorder,
  renderQuotePdf,
  scanBottlenecks,
  scanFollowups,
  startOnboarding,
  summarizeProjectPl,
} from "../src/lib/propose-surface.js";

describe("propose surface", () => {
  it("indexes audit samples without copying bodies", () => {
    const pack = buildAuditPackIndex([
      {
        sampleId: "S1",
        contractId: "CTR-1",
        invoiceId: "INV-1",
        transferRef: "TR-1",
        journalEntryId: "JE-1",
      },
    ]);
    expect(pack.samples[0]).toEqual({
      sampleId: "S1",
      contractId: "CTR-1",
      invoiceId: "INV-1",
      transferRef: "TR-1",
      journalEntryId: "JE-1",
    });
    expect(JSON.stringify(pack)).not.toContain("本文");
  });

  it("refuses the same person as purchaser and acceptor", () => {
    expect(
      findSodConflicts([
        { action: "purchase", actorId: "OP-1", subjectId: "PO-1" },
        { action: "accept", actorId: "OP-1", subjectId: "PO-1" },
      ]),
    ).toHaveLength(1);
    expect(
      findSodConflicts([
        { action: "request", actorId: "OP-1", subjectId: "APR-1" },
        { action: "approve", actorId: "OP-2", subjectId: "APR-1" },
      ]),
    ).toEqual([]);
  });

  it("sums project P/L and accepts project_code on a journal line", () => {
    expect(
      summarizeProjectPl([
        {
          lines: [
            { project_code: "P1", account_code: "4000", debit_yen: 0, credit_yen: 100 },
            { project_code: "P1", account_code: "5000", debit_yen: 40, credit_yen: 0 },
            { account_code: "1100", debit_yen: 60, credit_yen: 0 },
          ],
        },
      ]),
    ).toEqual([{ project_code: "P1", net_yen: 60 }]);
    expect(
      journalEntryLineSchema.parse({
        account_code: "4000",
        credit_yen: 1,
        project_code: "P1",
      }).project_code,
    ).toBe("P1");
  });

  it("scans due items and stuck work without sending", () => {
    expect(
      scanFollowups(
        [
          { id: "A", dueOn: "2026-09-22", kind: "invoice" },
          { id: "B", dueOn: "2026-10-01", kind: "invoice" },
        ],
        "2026-09-21",
        7,
      ).map((item) => item.id),
    ).toEqual(["A"]);
    expect(
      scanBottlenecks(
        [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
        "2026-09-21",
        3,
      )[0]?.stuckDays,
    ).toBe(20);
  });

  it("parses an invoice fixture and matches the offline catalog", () => {
    const candidate = parseInvoiceFixture("請求 T1234567890123 消費税 10% 11000 円");
    expect(candidate).toMatchObject({
      tNumber: "T1234567890123",
      taxCategory: "taxable_10",
      amountYen: 11000,
      posting: "proposal",
    });
    expect(
      matchRegistration(
        {
          version: 1,
          registrations: [
            {
              t_number: "T1234567890123",
              legal_name: "Example",
              status: "verified",
              verified_as_of: "2026-09-01",
              source_ref: "fixture",
            },
          ],
        },
        candidate.tNumber,
      ),
    ).toBe("verified");
  });

  it("extracts BANT and leaves stage apply to a human", () => {
    const bant = extractBant("予算: 100万円\n決裁: 部長\nニーズ: 台帳\n時期: 10月");
    expect(bant.proposedStage).toBe("propose");
    expect(bant.apply).toBe("human");
  });

  it("proposes dispatch, completion, stock, and analytics without sending", () => {
    expect(
      proposeDispatch(
        [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
        [
          { id: "ST-1", skills: ["electric"], free: true, waypoint: "site-b" },
          { id: "ST-2", skills: ["electric"], free: true, waypoint: "site-a" },
        ],
      )[0]?.staffId,
    ).toBe("ST-2");
    const done = proposeJobCompletion("sku:PART-1 qty:2 を交換", "JOB-1");
    expect(done.stockProposal).toEqual({ sku: "PART-1", qty: 2 });
    expect(done.sent).toBe(false);
    expect(proposeConsumption("PART-1", 2, 5)).toEqual({
      sku: "PART-1",
      nextQty: 3,
      apply: "human",
    });
    expect(
      proposeReorder([{ id: "PART-1", stock_qty: 1, threshold: 3 }]),
    ).toEqual([{ sku: "PART-1", qty: 3, apply: "human" }]);
    expect(
      analyzeFieldTime([{ staffId: "ST-1", minutes: 30, travelMinutes: 40 }]).suggestion,
    ).toContain("移動");
  });

  it("issues portal and tracking links from ids only", () => {
    const grant = issuePortalGrant({
      granteeId: "CUST-1",
      contractId: "CTR-1",
      invoiceId: "INV-1",
      orderStatus: "accepted",
    });
    expect(grant.shows).toEqual(["CTR-1", "INV-1", "accepted"]);
    expect(grant.path.startsWith("/portal/")).toBe(true);
    const track = issueTrackingUrl({ jobId: "JOB-1", assigneeId: "ST-1", eta: "15:00" });
    expect(track).toMatchObject({ assigneeId: "ST-1", eta: "15:00" });
    expect(track.path.startsWith("/track/")).toBe(true);
  });

  it("refuses My Number fields on onboarding", () => {
    expect(startOnboarding({ personRef: "PER-1", esignCaseId: "ESIGN-1" }).steps).toContain(
      "esign_request",
    );
    expect(() => assertNoHrSecretFields({ my_number: "000" })).toThrow(/my_number/);
  });

  it("builds a cash series, a quote draft, a chain index, and human-gated drafts", async () => {
    expect(
      buildDailyCashSeries({
        openingYen: 100,
        from: "2026-09-21",
        to: "2026-09-22",
        flows: [
          { date: "2026-09-21", yen: -30 },
          { date: "2026-09-22", yen: 10 },
        ],
      }),
    ).toEqual([
      { date: "2026-09-21", balanceYen: 70 },
      { date: "2026-09-22", balanceYen: 80 },
    ]);
    const pdf = await renderQuotePdf({ quoteId: "Q-1", title: "Draft", amountYen: 1000 });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(bridgeEventIndex([{ kind: "journal", id: "JE-1" }])[0]?.digest).toHaveLength(64);
    expect(draftLostDealFollowup({ dealId: "DEAL-1", silentDays: 14 }).sent).toBe(false);
    expect(() =>
      proposeExpenseIntake({ channel: "line", referenceId: "ECL-1", photo: Buffer.from("x") }),
    ).toThrow(/photo/);
    expect(proposePayrollTransfer({ payrollRunId: "PR-1", totalYen: 10 }).executed).toBe(false);
  });

  it("rejects a manifest that sets can_execute", () => {
    expect(
      validateModuleAiDeclaration({
        ai: {
          can_observe: true,
          can_analyze: true,
          can_draft: true,
          can_propose: true,
          can_approve: false,
          can_execute: true,
        },
      }).join(" "),
    ).toMatch(/can_execute/);
  });
});
