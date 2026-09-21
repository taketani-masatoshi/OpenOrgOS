/**
 * Propose report envelope contract.
 * Path: tests/propose-report-schema.test.ts
 */
import { describe, expect, it } from "vitest";
import { proposeReportEnvelopeSchema } from "../schemas/propose-report.js";
import {
  makeProposeReport,
  renderAiaCycleReport,
  renderAuditPack,
  renderBantReport,
  renderBottleneckReport,
  renderCashflowReport,
  renderDispatchReport,
  renderExpenseIntakeReport,
  renderFieldAnalyticsReport,
  renderFieldInterfaceReport,
  renderFollowupReport,
  renderHrLifecycleReport,
  renderInvoiceJournalReport,
  renderLostDealFollowupReport,
  renderPayrollTransferReport,
  renderPortalGrant,
  renderProjectPlReport,
  renderReplanReport,
  renderSodReport,
  renderStockReorderReport,
  renderTraceBridgeReport,
  renderTrackingStatus,
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

function assertEnvelopeShape(flat: Record<string, unknown>): void {
  expect(typeof flat.kind).toBe("string");
  expect(flat.version).toBe(1);
  expect(typeof flat.generated_at).toBe("string");
  expect(Array.isArray(flat.inputs_ref)).toBe(true);
  expect(flat.human_gate).toMatchObject({ apply: "human" });
  expect(["L0", "L1", "L2"]).toContain(flat.depth);
  const rebuilt = proposeReportEnvelopeSchema.parse({
    kind: flat.kind,
    version: flat.version,
    generated_at: flat.generated_at,
    inputs_ref: flat.inputs_ref,
    human_gate: flat.human_gate,
    depth: flat.depth,
    payload: { marker: true },
  });
  expect(rebuilt.human_gate.apply).toBe("human");
}

describe("propose report schema", () => {
  it("makeProposeReport builds a typed envelope", () => {
    const report = makeProposeReport({
      kind: "followup-report",
      depth: "L1",
      payload: { drafts: [] },
      human_gate: { sent: false },
    });
    expect(report.version).toBe(1);
    expect(report.human_gate.apply).toBe("human");
    expect(report.depth).toBe("L1");
  });

  it("flattened render* outputs carry envelope fields", () => {
    const samples: Array<Record<string, unknown>> = [
      renderSodReport([
        { action: "request", actorId: "A", subjectId: "S" },
        { action: "approve", actorId: "B", subjectId: "S" },
      ]),
      renderFollowupReport([{ id: "A", dueOn: "2026-09-22", kind: "invoice" }], "2026-09-21", 7),
      renderBottleneckReport(
        [{ id: "J1", ownerId: "OP-1", waitingSince: "2026-09-01", kind: "job" }],
        "2026-09-21",
        3,
      ),
      renderTraceBridgeReport([{ kind: "journal", id: "J-1" }]),
      renderExpenseIntakeReport({ channel: "chat", referenceId: "ECL-20260921-001" }),
      renderPayrollTransferReport({ payrollRunId: "RUN-1", totalYen: 100 }),
      renderAuditPack([{ sampleId: "S1", contractId: "CTR-1" }]),
      renderProjectPlReport([
        { lines: [{ account_code: "5000", debit_yen: 10, credit_yen: 0, project_code: "P1" }] },
      ]),
      renderCashflowReport({
        openingYen: 100,
        from: "2026-09-21",
        to: "2026-09-21",
        flows: [],
      }),
      renderBantReport("予算: 1\n決裁: x\nニーズ: y\n時期: z"),
      renderLostDealFollowupReport({ dealId: "D1", silentDays: 14 }),
      renderAiaCycleReport({
        followups: [{ id: "A" }],
        bottlenecks: [{ id: "B" }],
        dispatch: [{ jobId: "J1" }],
      }),
      renderInvoiceJournalReport("T1234567890123 1100円 10%", catalog),
      renderStockReorderReport([{ id: "PART-1", stock_qty: 1, threshold: 3 }]),
      renderDispatchReport(
        [{ id: "JOB-1", skill: "electric" }],
        [{ id: "ST-1", skills: ["electric"], free: true, load: 1 }],
      ),
      renderReplanReport(
        [{ id: "JOB-1", skill: "electric" }],
        [{ id: "ST-1", skills: ["electric"], free: true }],
      ),
      renderFieldInterfaceReport({ channel: "chat", text: "done", jobId: "JOB-1" }),
      renderFieldAnalyticsReport([{ staffId: "ST-1", minutes: 60, travelMinutes: 10 }]),
      renderPortalGrant({ granteeId: "CUST-1", orderStatus: "accepted" }),
      renderTrackingStatus({ jobId: "JOB-1", assigneeId: "ST-1", eta: "15:00" }),
      renderHrLifecycleReport({
        mode: "offboarding",
        personRef: "PER-1",
        esignCaseId: "ESIGN-1",
      }),
    ];
    for (const sample of samples) {
      assertEnvelopeShape(sample);
    }
  });
});
