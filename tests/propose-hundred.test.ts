/** @catalog-ids: field_ops, client_portal, hr_lifecycle */
import { describe, expect, it } from "vitest";
import { buildChainPayloadDigest } from "../src/lib/company-events-chain.js";
import {
  acceptFieldReport,
  analyzeFieldTime,
  applyConsumption,
  buildAuditPackIndex,
  buildDailyCashSeries,
  draftChainEvent,
  draftLostDealFollowup,
  extractBant,
  findSodConflicts,
  issuePortalGrant,
  issueTrackingUrl,
  proposeAiaCycle,
  proposeConsumption,
  proposeExpenseIntake,
  proposeInvoiceJournal,
  proposeJobCompletion,
  proposePayrollTransfer,
  proposeReplan,
  renderSalesQuotePdf,
  scanBottlenecks,
  scanFollowups,
  scoreDispatch,
  startOffboarding,
  summarizeProjectPl,
} from "../src/lib/propose-surface.js";

const catalog = {
  version: 1 as const,
  registrations: [
    {
      t_number: "T1234567890123",
      legal_name: "Example",
      status: "verified" as const,
      verified_as_of: "2026-09-01",
      source_ref: "fixture",
    },
  ],
};

describe("hundred point inside doctrine", () => {
  it("lost-deal draft is unsent and has no channel", () => {
    const draft = draftLostDealFollowup({ dealId: "DEAL-1", silentDays: 14 });
    expect(draft.sent).toBe(false);
    expect(draft.channel).toBeNull();
    expect(draft.subject).toContain("DEAL-1");
  });

  it("tracking status has no coordinates", () => {
    const track = issueTrackingUrl({
      jobId: "JOB-1",
      assigneeId: "ST-1",
      eta: "15:00",
      status: "departed",
    });
    expect(track.status).toBe("departed");
    expect(track.coordinates).toBeNull();
    expect(() =>
      issueTrackingUrl({
        jobId: "JOB-1",
        assigneeId: "ST-1",
        eta: "15:00",
        latitude: 35,
      }),
    ).toThrow(/coordinates/);
  });

  it("field analytics note is not an order", () => {
    const note = analyzeFieldTime([{ staffId: "ST-1", minutes: 30, travelMinutes: 40 }]);
    expect(note.note.ordered).toBe(false);
    expect(note.note.observation).toContain("移動");
  });

  it("bottleneck notice is not sent", () => {
    const row = scanBottlenecks(
      [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
      "2026-09-21",
      3,
    )[0];
    expect(row?.notice.notified).toBe(false);
    expect(row?.stuckDays).toBe(20);
  });

  it("audit pack refuses a body and requires one link id", () => {
    expect(() =>
      buildAuditPackIndex([{ sampleId: "S1", body: "secret text" }]),
    ).toThrow(/body/);
    expect(() => buildAuditPackIndex([{ sampleId: "S1" }])).toThrow(/needs a contract/);
    expect(buildAuditPackIndex([{ sampleId: "S1", journalEntryId: "JE-1" }]).samples[0]).toEqual({
      sampleId: "S1",
      journalEntryId: "JE-1",
    });
  });

  it("payroll proposal matches a dry-run broker transfer and does not file tax", () => {
    const proposal = proposePayrollTransfer({ payrollRunId: "PR-1", totalYen: 1000 });
    expect(proposal).toMatchObject({
      amountYen: 1000,
      reference: "PR-1",
      payee: "payroll",
      executed: false,
      dryRun: true,
      instruction: "broker transfer",
    });
    expect(proposal).not.toHaveProperty("taxPayment");
  });

  it("replan ranks the same waypoint first and does not apply", () => {
    const plan = proposeReplan(
      [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
      [
        { id: "ST-1", skills: ["electric"], free: true, waypoint: "site-b" },
        { id: "ST-2", skills: ["electric"], free: true, waypoint: "site-a" },
        { id: "ST-3", skills: ["electric"], free: true, waypoint: "site-a" },
      ],
      ["ST-2"],
    )[0];
    expect(plan?.ranked[0]?.staffId).toBe("ST-3");
    expect(plan?.applied).toBe(false);
    expect(plan?.apply).toBe("human");
  });

  it("expense intake becomes a claim proposal and refuses a photo", () => {
    const claim = proposeExpenseIntake({
      channel: "slack",
      referenceId: "ECL-20260921-001",
      amountYen: 1200,
    });
    expect(claim.apply).toBe("human");
    expect(claim.claim).toMatchObject({
      claimId: "ECL-20260921-001",
      amountYen: 1200,
      status: "proposal",
    });
    expect(() =>
      proposeExpenseIntake({ channel: "line", referenceId: "ECL-1", photo: Buffer.from("x") }),
    ).toThrow(/photo/);
  });

  it("sales quote pdf uses the quote record and is still a draft", async () => {
    const pdf = await renderSalesQuotePdf({
      id: "QUOTE-2026-001",
      deal_id: "DEAL-2026-001",
      account_id: "CUST-2026-001",
      amount_man: 2,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const bytes = pdf.toString("latin1").toLowerCase();
    expect(bytes).toContain(Buffer.from("DEAL-2026-001", "ascii").toString("hex"));
    expect(bytes).toContain(Buffer.from("20000 JPY", "ascii").toString("hex"));
    expect(bytes).toContain(Buffer.from("human", "ascii").toString("hex"));
  });

  it("invoice fixture proposes balanced lines and does not post", () => {
    const posted = proposeInvoiceJournal("請求 T1234567890123 軽減 8% 800 円", catalog);
    expect(posted.candidate.taxCategory).toBe("taxable_8");
    expect(posted.registration).toBe("verified");
    expect(posted.posted).toBe(false);
    expect(posted.lines.reduce((sum, line) => sum + line.debit_yen - line.credit_yen, 0)).toBe(0);
    const exempt = proposeInvoiceJournal("非課税 500 円", catalog);
    expect(exempt.candidate.taxCategory).toBe("exempt");
  });

  it("cash series includes orders and recurring amounts", () => {
    const series = buildDailyCashSeries({
      openingYen: 100,
      from: "2026-09-21",
      to: "2026-09-22",
      flows: [],
      orders: [{ date: "2026-09-21", yen: -40 }],
      recurring: [{ date: "2026-09-22", yen: -10 }],
    });
    expect(series).toEqual([
      { date: "2026-09-21", balanceYen: 60 },
      { date: "2026-09-22", balanceYen: 50 },
    ]);
  });

  it("project P/L applies a human allocation table", () => {
    expect(
      summarizeProjectPl(
        [
          {
            lines: [{ account_code: "5000", debit_yen: 40, credit_yen: 0 }],
          },
        ],
        [{ account_code: "5000", project_code: "P9", ratio: 1 }],
      ),
    ).toEqual([{ project_code: "P9", net_yen: -40 }]);
  });

  it("bant names a stage without invoking a change", () => {
    const bant = extractBant("予算: 100万円\n決裁: 部長\nニーズ: 台帳\n時期: 10月");
    expect(bant.proposedStage).toBe("propose");
    expect(bant.apply).toBe("human");
    expect(bant.invoked).toBe(false);
  });

  it("followup drafts are unsent", () => {
    const drafts = scanFollowups(
      [{ id: "A", dueOn: "2026-09-22", kind: "invoice" }],
      "2026-09-21",
      7,
    );
    expect(drafts[0]?.sent).toBe(false);
    expect(drafts[0]?.draft).toContain("A");
  });

  it("sod accepts a declared incompatible pair and does not name a substitute", () => {
    expect(
      findSodConflicts(
        [
          { action: "purchase", actorId: "OP-1", subjectId: "PO-1" },
          { action: "request", actorId: "OP-1", subjectId: "PO-1" },
        ],
        [{ left: "purchase", right: "request" }],
      )[0],
    ).toContain("OP-1");
    expect(findSodConflicts.toString()).not.toContain("substitute");
  });

  it("portal grant refuses a document body", () => {
    expect(
      issuePortalGrant({ granteeId: "CUST-1", contractId: "CTR-1", orderStatus: "accepted" }).shows,
    ).toEqual(["CTR-1", "accepted"]);
    expect(() =>
      issuePortalGrant({ granteeId: "CUST-1", body: "contract text" } as never),
    ).toThrow(/body/);
  });

  it("job completion stock matches a consumption proposal", () => {
    const done = proposeJobCompletion("sku:PART-1 qty:2", "JOB-1");
    expect(done.stockProposal).toEqual({ sku: "PART-1", qty: 2 });
    expect(proposeConsumption(done.stockProposal!.sku, done.stockProposal!.qty, 5).nextQty).toBe(3);
  });

  it("stock apply changes quantity only when a human asks", () => {
    expect(
      applyConsumption({ sku: "PART-1", qty: 2, onHand: 5, apply: false }),
    ).toMatchObject({ nextQty: 5, applied: false, sent: false });
    expect(applyConsumption({ sku: "PART-1", qty: 2, onHand: 5, apply: true }).nextQty).toBe(3);
  });

  it("dispatch scores waypoint matches and refuses a gps trace", () => {
    const ranked = scoreDispatch(
      [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
      [
        { id: "ST-1", skills: ["electric"], free: true, waypoint: "site-b" },
        { id: "ST-2", skills: ["electric"], free: true, waypoint: "site-a" },
      ],
    )[0];
    expect(ranked?.ranked[0]?.staffId).toBe("ST-2");
    expect(() =>
      scoreDispatch(
        [{ id: "JOB-1", skill: "electric" }],
        [{ id: "ST-1", skills: ["electric"], free: true, latitude: 1 } as never],
      ),
    ).toThrow(/gps trace/);
  });

  it("field channels accept text and refuse audio bytes", () => {
    const mail = acceptFieldReport({ channel: "mail", text: "sku:PART-1 qty:1", jobId: "JOB-1" });
    const voice = acceptFieldReport({
      channel: "voice_transcript",
      text: "sku:PART-1 qty:1",
      jobId: "JOB-1",
    });
    expect(mail.stockProposal).toEqual(voice.stockProposal);
    expect(mail.sent).toBe(false);
    expect(() =>
      acceptFieldReport({
        channel: "chat",
        text: "done",
        jobId: "JOB-1",
        audio: Buffer.from("wav"),
      }),
    ).toThrow(/audio/);
  });

  it("chat text uses the same job completion proposal", () => {
    const chat = acceptFieldReport({ channel: "chat", text: "sku:PART-9 qty:3", jobId: "JOB-9" });
    expect(chat.channel).toBe("chat");
    expect(chat.stockProposal).toEqual({ sku: "PART-9", qty: 3 });
    expect(chat.sent).toBe(false);
  });

  it("offboarding drafts social insurance and refuses secrets", () => {
    const leave = startOffboarding({ personRef: "PER-1", esignCaseId: "ESIGN-1" });
    expect(leave.steps).toContain("esign_request");
    expect(leave.filed).toBe(false);
    expect(leave.socialInsuranceDraft).toContain("PER-1");
    expect(() => startOffboarding({ personRef: "PER-1", esignCaseId: "ESIGN-1", my_number: "x" } as never)).toThrow(
      /my_number/,
    );
  });

  it("chain draft digest matches a create payload and does not write the chain", () => {
    const draft = draftChainEvent({
      kind: "journal",
      id: "EVT-20260921-journal",
      occurredAt: "2026-09-21T00:00:00.000Z",
    });
    expect(draft.wroteChain).toBe(false);
    expect(draft.digest).toBe(
      buildChainPayloadDigest({
        action: "create",
        event: {
          id: "EVT-20260921-journal",
          occurred_at: "2026-09-21T00:00:00.000Z",
          kind: "finance",
          title: "EVT-20260921-journal",
          status: "open",
        },
      }),
    );
  });

  it("aia cycle lists proposals and does not loop or execute", () => {
    const cycle = proposeAiaCycle({
      followups: [{ id: "A" }],
      bottlenecks: [{ id: "B" }],
      dispatch: [{ jobId: "JOB-1" }],
    });
    expect(cycle.looping).toBe(false);
    expect(cycle.executed).toBe(false);
    expect(cycle.proposals.map((item) => item.id)).toEqual(["A", "B", "JOB-1"]);
    expect(cycle.proposals.every((item) => item.sent === false)).toBe(true);
  });
});
