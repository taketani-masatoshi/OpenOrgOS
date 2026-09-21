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
  renderAuditPack,
  renderAiaCycleReport,
  renderBantReport,
  renderBottleneckReport,
  renderCashflowReport,
  renderDispatchReport,
  renderExpenseIntakeReport,
  renderFieldAnalyticsReport,
  renderFieldIntakeReport,
  renderFieldInterfaceReport,
  renderFollowupReport,
  renderHrLifecycleReport,
  renderInvoiceJournalReport,
  renderJobCompletionReport,
  renderLostDealFollowupReport,
  renderPayrollTransferReport,
  renderPortalGrant,
  renderProjectPlReport,
  renderQuoteDraftReport,
  renderReplanReport,
  renderSalesQuotePdf,
  renderSodReport,
  renderStockReorderReport,
  renderTraceBridgeReport,
  renderTrackingStatus,
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
    const report = renderLostDealFollowupReport({ dealId: "DEAL-1", silentDays: 14 });
    expect(report.kind).toBe("lost-deal-followup-report");
    expect(report.sent).toBe(false);
    expect(report.predicted).toBe(false);
    expect(report.channel).toBeNull();
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
    const report = renderTrackingStatus({
      jobId: "JOB-1",
      assigneeId: "ST-1",
      eta: "15:00",
      status: "departed",
    });
    expect(report.kind).toBe("tracking-status");
    expect(report.mapTiles).toBe(false);
    expect(report.coordinates).toBeNull();
  });

  it("tracking resolves assignee and eta from the job ledger", () => {
    const jobs = [
      { id: "JOB-001", assignee_id: "ST-001", eta: "15:00", status: "enroute" as const },
    ];
    const report = renderTrackingStatus({ jobId: "JOB-001", jobs });
    expect(report.depth).toBe("L2");
    expect(report.jobFound).toBe(true);
    expect(report.assigneeId).toBe("ST-001");
    expect(report.eta).toBe("15:00");
    expect(report.mapTiles).toBe(false);
    const missing = renderTrackingStatus({
      jobId: "JOB-MISSING",
      assigneeId: "ST-9",
      eta: "12:00",
      jobs,
    });
    expect(missing.jobFound).toBe(false);
    expect(missing.missing_refs).toContain("job:JOB-MISSING");
  });

  it("field analytics note is not an order", () => {
    const note = analyzeFieldTime([{ staffId: "ST-1", minutes: 30, travelMinutes: 40 }]);
    expect(note.note.ordered).toBe(false);
    expect(note.note.observation).toContain("移動");
    const report = renderFieldAnalyticsReport([
      { staffId: "ST-1", minutes: 30, travelMinutes: 40 },
    ]);
    expect(report.kind).toBe("field-analytics-report");
    expect(report.depth).toBe("L1");
    expect(report.ordered).toBe(false);
    expect(report.travelMinutes).toBe(40);
  });

  it("field analytics reads work/travel minutes from jobs when rows omitted", async () => {
    const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getTenantsDir, setTenantId } = await import("../src/lib/tenant.js");
    const tenant = `field-analytics-${process.pid}`;
    const tenantDir = join(getTenantsDir(), tenant);
    mkdirSync(join(tenantDir, "data", "field_ops"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: field analytics fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
      "utf-8",
    );
    writeFileSync(
      join(tenantDir, "data", "field_ops", "jobs.yaml"),
      [
        "version: 1",
        "jobs:",
        "  - id: JOB-1",
        "    assignee_id: ST-1",
        "    work_minutes: 30",
        "    travel_minutes: 40",
        "  - id: JOB-2",
        "    assignee_id: ST-1",
        "    work_minutes: 20",
        "    travel_minutes: 10",
        "",
      ].join("\n"),
      "utf-8",
    );
    const prev = process.env.ORGOS_TENANT;
    try {
      process.env.ORGOS_TENANT = tenant;
      setTenantId(tenant);
      const report = renderFieldAnalyticsReport();
      expect(report.kind).toBe("field-analytics-report");
      expect(report.depth).toBe("L2");
      expect(report.inputs_ref).toContain("data/field_ops/jobs.yaml");
      expect(report.totalMinutes).toBe(50);
      expect(report.travelMinutes).toBe(50);
      expect(report.ordered).toBe(false);
      expect(report.rowCount).toBe(1);
    } finally {
      rmSync(tenantDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prev;
      setTenantId(prev?.trim() || "mal");
    }
  });

  it("bottleneck notice is not sent", () => {
    const row = scanBottlenecks(
      [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
      "2026-09-21",
      3,
    )[0];
    expect(row?.notice.notified).toBe(false);
    expect(row?.stuckDays).toBe(20);
    const report = renderBottleneckReport(
      [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
      "2026-09-21",
      3,
    );
    expect(report.kind).toBe("bottleneck-report");
    expect(report.depth).toBe("L1");
    expect(report.notified).toBe(false);
    expect(report.items[0]?.stuckDays).toBe(20);
  });

  it("bottleneck reads pending-approvals when items are omitted", async () => {
    const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getTenantsDir, setTenantId } = await import("../src/lib/tenant.js");
    const tenant = `bn-pending-${process.pid}`;
    const tenantDir = join(getTenantsDir(), tenant);
    mkdirSync(join(tenantDir, "data", "org"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: bottleneck fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
      "utf-8",
    );
    writeFileSync(
      join(tenantDir, "data", "org", "pending-approvals.yaml"),
      [
        "approvals:",
        "  - approval_id: APR-20260901-001",
        "    scope: internal",
        "    status: pending_approval",
        "    proposed_at: 2026-09-01T00:00:00.000Z",
        "    proposed_by: ops",
        "    subject_type: expense.claim",
        "    approver_id: CEO",
        "  - approval_id: APR-20260920-001",
        "    scope: internal",
        "    status: completed",
        "    proposed_at: 2026-08-01T00:00:00.000Z",
        "    proposed_by: ops",
        "    subject_type: expense.claim",
        "",
      ].join("\n"),
      "utf-8",
    );
    const prev = process.env.ORGOS_TENANT;
    try {
      process.env.ORGOS_TENANT = tenant;
      setTenantId(tenant);
      const report = renderBottleneckReport(undefined, "2026-09-21", 3);
      expect(report.kind).toBe("bottleneck-report");
      expect(report.depth).toBe("L2");
      expect(report.inputs_ref).toContain("data/org/pending-approvals.yaml");
      expect(report.notified).toBe(false);
      expect(report.items).toHaveLength(1);
      expect(report.items[0]).toMatchObject({
        id: "APR-20260901-001",
        ownerId: "CEO",
        stuckDays: 20,
        kind: "approval",
      });
    } finally {
      rmSync(tenantDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prev;
      setTenantId(prev?.trim() || "mal");
    }
  });

  it("audit pack refuses a body and requires one link id", () => {
    expect(() =>
      buildAuditPackIndex([{ sampleId: "S1", body: "secret text" }]),
    ).toThrow(/body/);
    expect(() => buildAuditPackIndex([{ sampleId: "S1" }])).toThrow(/needs a contract/);
    const pack = renderAuditPack([
      {
        sampleId: "S1",
        invoiceId: "INV-1",
        transferRef: "TR-1",
      },
    ]);
    expect(pack.kind).toBe("audit-pack");
    expect(pack.depth).toBe("L1");
    expect(pack.inputs_ref).toEqual([]);
    expect(pack.samples).toEqual([
      {
        sampleId: "S1",
        invoiceId: "INV-1",
        transferRef: "TR-1",
      },
    ]);
    expect(JSON.stringify(pack)).not.toContain("secret");
  });

  it("audit pack depth L2 when contract or journal SoT exists", async () => {
    const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getTenantsDir, setTenantId } = await import("../src/lib/tenant.js");
    const tenant = `audit-pack-${process.pid}`;
    const tenantDir = join(getTenantsDir(), tenant);
    mkdirSync(join(tenantDir, "data", "contracts"), { recursive: true });
    mkdirSync(join(tenantDir, "data", "finance"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: audit pack fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
      "utf-8",
    );
    writeFileSync(join(tenantDir, "data", "contracts", "CTR-AUDIT.yaml"), "id: CTR-AUDIT\n", "utf-8");
    writeFileSync(join(tenantDir, "data", "finance", "journal-entries.yaml"), "entries: []\n", "utf-8");
    const prev = process.env.ORGOS_TENANT;
    try {
      process.env.ORGOS_TENANT = tenant;
      setTenantId(tenant);
      const pack = renderAuditPack([
        { sampleId: "S1", contractId: "CTR-AUDIT", journalEntryId: "JE-1" },
      ]);
      expect(pack.depth).toBe("L2");
      expect(pack.inputs_ref).toEqual(
        expect.arrayContaining([
          "data/contracts/CTR-AUDIT.yaml",
          "data/finance/journal-entries.yaml",
        ]),
      );
      expect(pack.missing_refs).toEqual([]);
    } finally {
      rmSync(tenantDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prev;
      setTenantId(prev?.trim() || "mal");
    }
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
    const report = renderPayrollTransferReport({ payrollRunId: "PR-1", totalYen: 1000 });
    expect(report.kind).toBe("payroll-transfer-report");
    expect(report.executed).toBe(false);
    expect(report.dryRun).toBe(true);
    expect(report.taxFiled).toBe(false);
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
    const report = renderReplanReport(
      [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
      [
        { id: "ST-1", skills: ["electric"], free: true, waypoint: "site-b" },
        { id: "ST-2", skills: ["electric"], free: true, waypoint: "site-a" },
        { id: "ST-3", skills: ["electric"], free: true, waypoint: "site-a" },
      ],
      ["ST-2"],
    );
    expect(report.kind).toBe("replan-report");
    expect(report.gpsAutoReorder).toBe(false);
    expect(report.plans[0]?.ranked[0]?.staffId).toBe("ST-3");
    expect(report.plans[0]?.applied).toBe(false);
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
    const report = renderExpenseIntakeReport({
      channel: "slack",
      referenceId: "ECL-20260921-001",
      amountYen: 1200,
    });
    expect(report.kind).toBe("expense-intake-report");
    expect(report.photo).toBeNull();
    expect(report.autoApprove).toBe(false);
    expect(report.apply).toBe("human");
  });

  it("expense intake resolves amount and status from the claims ledger when present", async () => {
    const { resolveExpenseClaimRef, renderExpenseIntakeReport: render } = await import(
      "../src/lib/propose/expense.js"
    );
    const resolved = resolveExpenseClaimRef("ECL-20260803-001");
    if (resolved.found) {
      expect(resolved.status).toBeTruthy();
      expect(resolved.amountYen).toBeTypeOf("number");
      const report = render({
        channel: "chat",
        referenceId: "ECL-20260803-001",
      });
      expect(report.depth).toBe("L2");
      expect(report.claim.foundInLedger).toBe(true);
      expect(report.claim.ledgerStatus).toBe(resolved.status);
      expect(report.claim.amountYen).toBe(resolved.amountYen);
      expect(report.autoApprove).toBe(false);
      expect(report.photo).toBeNull();
    } else {
      expect(resolved.missing_refs.length).toBeGreaterThan(0);
      const report = render({
        channel: "chat",
        referenceId: "ECL-20990101-999",
        amountYen: 500,
      });
      expect(report.claim.foundInLedger).toBe(false);
      expect(report.claim.amountYen).toBe(500);
      expect(report.autoApprove).toBe(false);
    }
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
    const report = await renderQuoteDraftReport({
      quoteId: "QUOTE-2026-001",
      title: "DEAL-2026-001",
      amountYen: 20_000,
    });
    expect(report.kind).toBe("quote-draft-report");
    expect(report.sent).toBe(false);
    expect(report.autoAssemble).toBe(false);
    expect(report.pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("invoice fixture proposes balanced lines and does not post", () => {
    const posted = proposeInvoiceJournal("請求 T1234567890123 軽減 8% 800 円", catalog);
    expect(posted.candidate.taxCategory).toBe("taxable_8");
    expect(posted.registration).toBe("verified");
    expect(posted.posted).toBe(false);
    expect(posted.lines.reduce((sum, line) => sum + line.debit_yen - line.credit_yen, 0)).toBe(0);
    const exempt = proposeInvoiceJournal("非課税 500 円", catalog);
    expect(exempt.candidate.taxCategory).toBe("exempt");
    const report = renderInvoiceJournalReport("請求 T1234567890123 軽減 8% 800 円", catalog);
    expect(report.kind).toBe("invoice-journal-report");
    expect(report.posted).toBe(false);
    expect(report.liveOcr).toBe(false);
    expect(report.liveNtaApi).toBe(false);
  });

  it("invoice intake defaults to offline catalog SoT when catalog is omitted", async () => {
    const { resolveInvoiceCatalog, renderInvoiceJournalReport: render } = await import(
      "../src/lib/propose/invoice.js"
    );
    const resolved = resolveInvoiceCatalog();
    expect(resolved.catalog.version).toBe(1);
    expect(Array.isArray(resolved.catalog.registrations)).toBe(true);
    const report = render("請求 T9999999999999 10% 100 円");
    expect(report.kind).toBe("invoice-journal-report");
    expect(report.liveOcr).toBe(false);
    expect(report.liveNtaApi).toBe(false);
    expect(report.posted).toBe(false);
    expect(report.registration).toBe("not_in_catalog");
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
    const report = renderCashflowReport({
      openingYen: 100,
      from: "2026-09-21",
      to: "2026-09-22",
      flows: [],
      orders: [{ date: "2026-09-21", yen: -40 }],
      recurring: [{ date: "2026-09-22", yen: -10 }],
    });
    expect(report.kind).toBe("cashflow-report");
    expect(report.autoImport).toBe(false);
    expect(report.graphUi).toBe(false);
    expect(report.series).toEqual(series);
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
    const report = renderProjectPlReport(
      [
        {
          lines: [{ account_code: "5000", debit_yen: 40, credit_yen: 0 }],
        },
      ],
      [{ account_code: "5000", project_code: "P9", ratio: 1 }],
    );
    expect(report.kind).toBe("project-pl-report");
    expect(report.autoLoad).toBe(false);
    expect(report.rows).toEqual([{ project_code: "P9", net_yen: -40 }]);
  });

  it("bant names a stage without invoking a change", () => {
    const bant = extractBant("予算: 100万円\n決裁: 部長\nニーズ: 台帳\n時期: 10月");
    expect(bant.proposedStage).toBe("propose");
    expect(bant.apply).toBe("human");
    expect(bant.invoked).toBe(false);
    const report = renderBantReport("予算: 100万円\n決裁: 部長\nニーズ: 台帳\n時期: 10月");
    expect(report.kind).toBe("bant-report");
    expect(report.invoked).toBe(false);
    expect(report.apply).toBe("human");
    expect(report.liveStt).toBe(false);
  });

  it("bant accepts a UTF-8 transcript file and refuses audio paths", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { loadBantTranscriptInput, renderBantReport: render } = await import(
      "../src/lib/propose/bant.js"
    );
    const dir = mkdtempSync(join(tmpdir(), "orgos-bant-"));
    try {
      const path = join(dir, "notes.txt");
      writeFileSync(path, "予算: 50万円\n決裁: 課長\nニーズ: 見積\n時期: 11月\n", "utf8");
      const loaded = loadBantTranscriptInput(path);
      expect(loaded.inputs_ref).toEqual([path]);
      const report = render(path);
      expect(report.depth).toBe("L2");
      expect(report.inputs_ref).toContain(path);
      expect(report.liveStt).toBe(false);
      expect(report.proposedStage).toBe("propose");
      const wav = join(dir, "call.wav");
      writeFileSync(wav, "not-audio", "utf8");
      expect(() => loadBantTranscriptInput(wav)).toThrow(/audio STT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("followup drafts are unsent", () => {
    const drafts = scanFollowups(
      [{ id: "A", dueOn: "2026-09-22", kind: "invoice" }],
      "2026-09-21",
      7,
    );
    expect(drafts[0]?.sent).toBe(false);
    expect(drafts[0]?.draft).toContain("A");
    const report = renderFollowupReport(
      [{ id: "A", dueOn: "2026-09-22", kind: "invoice" }],
      "2026-09-21",
      7,
    );
    expect(report.kind).toBe("followup-report");
    expect(report.sent).toBe(false);
    expect(report.drafts[0]?.id).toBe("A");
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
    const report = renderSodReport(
      [
        { action: "purchase", actorId: "OP-1", subjectId: "PO-1" },
        { action: "request", actorId: "OP-1", subjectId: "PO-1" },
      ],
      [{ left: "purchase", right: "request" }],
    );
    expect(report.kind).toBe("sod-report");
    expect(report.ok).toBe(false);
    expect(report.substitute).toBeNull();
    expect(report.issues[0]).toContain("OP-1");
  });

  it("portal grant refuses a document body", () => {
    expect(
      issuePortalGrant({ granteeId: "CUST-1", contractId: "CTR-1", orderStatus: "accepted" }).shows,
    ).toEqual(["CTR-1", "accepted"]);
    expect(() =>
      issuePortalGrant({ granteeId: "CUST-1", body: "contract text" } as never),
    ).toThrow(/body/);
    const grant = renderPortalGrant({
      granteeId: "CUST-1",
      contractId: "CTR-1",
      orderStatus: "accepted",
    });
    expect(grant.kind).toBe("portal-grant");
    expect(grant.body).toBeNull();
    expect(grant.shows).toEqual(["CTR-1", "accepted"]);
  });

  it("job completion stock matches a consumption proposal", () => {
    const done = proposeJobCompletion("sku:PART-1 qty:2", "JOB-1");
    expect(done.stockProposal).toEqual({ sku: "PART-1", qty: 2 });
    expect(proposeConsumption(done.stockProposal!.sku, done.stockProposal!.qty, 5).nextQty).toBe(3);
    const report = renderJobCompletionReport("sku:PART-1 qty:2", "JOB-1");
    expect(report.kind).toBe("job-completion-report");
    expect(report.liveSpeechToText).toBe(false);
    expect(report.stockDeducted).toBe(false);
    expect(report.sent).toBe(false);
    expect(report.stockProposal).toEqual({ sku: "PART-1", qty: 2 });
  });

  it("field interface previews stock from an on-hand map without deducting", async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { getTenantsDir, setTenantId } = await import("../src/lib/tenant.js");
    const { loadFieldReportText, renderFieldInterfaceReport: render } = await import(
      "../src/lib/propose/job-complete.js"
    );
    const dir = mkdtempSync(join(tmpdir(), "orgos-field-"));
    const tenant = `field-if-${process.pid}`;
    const tenantDir = join(getTenantsDir(), tenant);
    mkdirSync(join(tenantDir, "data", "field_ops"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: field if fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
      "utf-8",
    );
    writeFileSync(
      join(tenantDir, "data", "field_ops", "jobs.yaml"),
      "version: 1\njobs:\n  - id: JOB-1\n    assignee_id: ST-9\n    eta: \"12:00\"\n",
      "utf-8",
    );
    const prev = process.env.ORGOS_TENANT;
    try {
      process.env.ORGOS_TENANT = tenant;
      setTenantId(tenant);
      const path = join(dir, "report.txt");
      writeFileSync(path, "sku:PART-1 qty:2\n", "utf8");
      expect(loadFieldReportText(path).inputs_ref).toEqual([path]);
      const report = render({
        channel: "voice_transcript",
        jobId: "JOB-1",
        text: path,
        onHandBySku: { "PART-1": 5 },
      });
      expect(report.depth).toBe("L2");
      expect(report.jobFound).toBe(true);
      expect(report.assigneeId).toBe("ST-9");
      expect(report.inputs_ref).toEqual(expect.arrayContaining([path, "data/field_ops/jobs.yaml"]));
      expect(report.stockPreview).toEqual({
        sku: "PART-1",
        onHand: 5,
        nextQty: 3,
        apply: "human",
      });
      expect(report.stockDeducted).toBe(false);
      expect(report.liveSpeechToText).toBe(false);
      const missing = render({
        channel: "text",
        jobId: "JOB-MISSING",
        text: "done",
      });
      expect(missing.jobFound).toBe(false);
      expect(missing.missing_refs).toContain("job:JOB-MISSING");
      const wav = join(dir, "note.wav");
      writeFileSync(wav, "x", "utf8");
      expect(() => loadFieldReportText(wav)).toThrow(/audio STT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(tenantDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prev;
      setTenantId(prev?.trim() || "mal");
    }
  });

  it("stock apply changes quantity only when a human asks", () => {
    expect(
      applyConsumption({ sku: "PART-1", qty: 2, onHand: 5, apply: false }),
    ).toMatchObject({ nextQty: 5, applied: false, sent: false });
    expect(applyConsumption({ sku: "PART-1", qty: 2, onHand: 5, apply: true }).nextQty).toBe(3);
    const report = renderStockReorderReport([
      { id: "PART-1", stock_qty: 1, threshold: 3 },
      { id: "PART-2", stock_qty: 10, threshold: 3 },
    ]);
    expect(report.kind).toBe("stock-reorder-report");
    expect(report.deducted).toBe(false);
    expect(report.sent).toBe(false);
    expect(report.proposals).toEqual([{ sku: "PART-1", qty: 3, apply: "human" }]);
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
    const report = renderDispatchReport(
      [{ id: "JOB-1", skill: "electric", waypoint: "site-a" }],
      [
        { id: "ST-1", skills: ["electric"], free: true, waypoint: "site-b" },
        { id: "ST-2", skills: ["electric"], free: true, waypoint: "site-a" },
      ],
    );
    expect(report.kind).toBe("dispatch-report");
    expect(report.gpsTrace).toBe(false);
    expect(report.routeOptimized).toBe(false);
    expect(report.applied).toBe(false);
    expect(report.assignments[0]?.staffId).toBe("ST-2");
  });

  it("dispatch resolves jobs and staff from ledger-shaped inputs", async () => {
    const { resolveDispatchInputs, renderDispatchReport: render } = await import(
      "../src/lib/propose/dispatch.js"
    );
    const resolved = resolveDispatchInputs({
      jobs: [{ id: "JOB-001", skill: "electric", waypoint: "site-a" }],
      staff: [
        { id: "ST-BUSY", skills: ["electric"], free: true, waypoint: "site-a", load: 3 },
        { id: "ST-FREE", skills: ["electric"], free: true, waypoint: "site-a", load: 0 },
      ],
    });
    expect(resolved.inputs_ref).toEqual([]);
    const report = render(resolved.jobs, resolved.staff);
    expect(report.depth).toBe("L1");
    expect(report.assignments[0]?.staffId).toBe("ST-FREE");
    expect(report.gpsTrace).toBe(false);
    const empty = resolveDispatchInputs();
    expect(empty.missing_refs).toEqual(
      expect.arrayContaining(["field_ops/jobs.yaml", "field_ops/staff.yaml"]),
    );
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
    const report = renderFieldIntakeReport({
      channel: "chat",
      text: "sku:PART-1 qty:1",
      jobId: "JOB-1",
    });
    expect(report.kind).toBe("field-intake-report");
    expect(report.standingBot).toBe(false);
    expect(report.liveSpeechToText).toBe(false);
    expect(report.sent).toBe(false);
    const iface = renderFieldInterfaceReport({
      channel: "chat",
      text: "sku:PART-1 qty:1",
      jobId: "JOB-1",
    });
    expect(iface.kind).toBe("field-interface-report");
    expect(iface.photoAccepted).toBe(false);
    expect(iface.standingBot).toBe(false);
    expect(() =>
      renderFieldInterfaceReport({
        channel: "chat",
        text: "done",
        jobId: "JOB-1",
        photo: Buffer.from("jpg"),
      }),
    ).toThrow(/photo/);
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
    const report = renderHrLifecycleReport({
      mode: "offboarding",
      personRef: "PER-1",
      esignCaseId: "ESIGN-1",
    });
    expect(report.kind).toBe("hr-lifecycle-report");
    expect(report.secretsStored).toBe(false);
    expect(report.filed).toBe(false);
    expect(report.socialInsuranceDraft).toContain("PER-1");
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
    const report = renderTraceBridgeReport([
      { kind: "journal", id: "EVT-20260921-journal" },
      { kind: "contract", id: "CTR-1" },
    ]);
    expect(report.kind).toBe("trace-bridge-report");
    expect(report.wroteChain).toBe(false);
    expect(report.singleGiantLog).toBe(false);
    expect(report.index).toHaveLength(2);
    expect(report.index[0]?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof report.index[0]?.in_chain).toBe("boolean");
  });

  it("trace bridge marks chain membership without writing the chain", async () => {
    const { loadCompanyEventChain } = await import("../src/lib/company-events-chain.js");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getDataDir } = await import("../src/lib/utils.js");
    const chainPath = join(getDataDir(), "company-events-chain.jsonl");
    if (!existsSync(chainPath)) return;
    const links = loadCompanyEventChain();
    const known = links[0]?.event_id;
    if (!known) return;
    const report = renderTraceBridgeReport([{ kind: "transfer", id: known }]);
    expect(report.depth).toBe("L2");
    expect(report.inputs_ref).toContain("data/company-events-chain.jsonl");
    expect(report.index[0]?.in_chain).toBe(true);
    expect(report.wroteChain).toBe(false);
    const missing = renderTraceBridgeReport([{ kind: "transfer", id: "EVT-missing-trace-id" }]);
    expect(missing.index[0]?.in_chain).toBe(false);
    expect(missing.missing_refs).toContain("chain:EVT-missing-trace-id");
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
    const report = renderAiaCycleReport({
      followups: [{ id: "A" }],
      bottlenecks: [{ id: "B" }],
      dispatch: [{ jobId: "JOB-1" }],
    });
    expect(report.kind).toBe("aia-cycle-report");
    expect(report.looping).toBe(false);
    expect(report.executed).toBe(false);
  });

  it("tower classify report wraps registry classification without assigning", async () => {
    const { renderTowerClassifyReport } = await import("../src/lib/propose/tower.js");
    const report = renderTowerClassifyReport("この稟議を承認して");
    expect(report.kind).toBe("tower-classify-report");
    expect(report.depth).toBe("L2");
    expect(report.inputs_ref).toContain("steward/core/dispatch-tower/registry.yaml");
    expect(report.human_gate).toMatchObject({ apply: "human" });
    expect(report.applied).toBe(false);
    expect(report.assigned).toBe(false);
    expect(report.classification.kind).toBe("judgment");
  });

  it("jsox status/evaluate reports wrap SoT without filing or signing", async () => {
    const { renderJsoxEvaluateReport, renderJsoxStatusReport } = await import(
      "../src/lib/propose/jsox.js"
    );
    const status = renderJsoxStatusReport();
    expect(status.kind).toBe("jsox-status-report");
    expect(status.human_gate).toMatchObject({ apply: "human" });
    expect(status.internalControlReport).toBe(false);
    expect(status.edinetFiled).toBe(false);
    expect(status.status).toBeTruthy();
    expect(Array.isArray(status.gaps)).toBe(true);

    const evaluate = renderJsoxEvaluateReport("OP-UNKNOWN");
    expect(evaluate.kind).toBe("jsox-evaluate-report");
    expect(evaluate.signed).toBe(false);
    expect(evaluate.internalControlReport).toBe(false);
    expect(evaluate.edinetFiled).toBe(false);
    expect(evaluate.ok).toBe(false);
  });
});
