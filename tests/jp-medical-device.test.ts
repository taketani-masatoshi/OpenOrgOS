import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadModuleManifest } from "../src/lib/modules.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import { gvpReportDueOn } from "../src/lib/medical-device/gvp-due.js";
import { assessApplicationForDeviceId } from "../src/lib/medical-device/application-completeness.js";
import { listMedicalDeviceAudit } from "../src/lib/medical-device/audit.js";
import {
  MEDICAL_DEVICE_APPROVAL_SUBJECTS,
  GVP_REPORT_LEAD_DAYS,
} from "../schemas/jp-medical-device.js";
import {
  addLedgerEntry,
  closeLedgerEntry,
  loadLedgerEntries,
  findLedgerByType,
  updateLedgerEntry,
  recordDocumentControlRevision,
} from "../src/lib/medical-device/ledger-ops.js";
import {
  applyMedicalDeviceApproval,
  proposeMedicalDeviceApproval,
  markPendingMedicalDeviceApproval,
} from "../src/lib/medical-device/approvals.js";
import { collectMedicalDeviceIntegrityIssues } from "../src/lib/medical-device/integrity.js";
import { collectMedicalDeviceDeadlines } from "../src/lib/medical-device/deadlines.js";
import {
  MedicalDeviceGateError,
  assertCapaEntryCloseable,
} from "../src/lib/medical-device/close-gates.js";
import {
  humanApproveOrgApproval,
  rejectOrgApproval,
} from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  runJpMedicalDeviceDeadlines,
  runJpMedicalDeviceLedgerStatus,
  runJpMedicalDeviceObligations,
  runJpMedicalDeviceValidate,
  runJpMedicalDeviceApplicationCatalog,
  runJpMedicalDeviceApplicationDraft,
  runJpMedicalDeviceAeAdd,
  runJpMedicalDeviceCapaOpen,
  runJpMedicalDeviceCapaClose,
  runJpMedicalDeviceCapaRecordEffectiveness,
  runJpMedicalDeviceCapaScheduleEffectiveness,
  runJpMedicalDeviceAeMarkFiled,
  runJpMedicalDeviceComplaintAdd,
  runJpMedicalDeviceComplaintPromoteAe,
  runJpMedicalDeviceInquiryClose,
  runJpMedicalDeviceLedgerClose,
  runJpMedicalDeviceGvpEscalate,
  runJpMedicalDeviceInquiryOpen,
  runJpMedicalDeviceInquirySetResponse,
} from "../steward/jurisdiction-packs/JP/modules/jp_medical_device/cli/lib.js";
import { currentDate, resolveTenantPath } from "../src/lib/utils.js";
import { setTenantId } from "../src/lib/tenant.js";

const EMPTY_LEDGER = `version: "1"\nentries: []\n`;

function ledgerAbs(rel: string): string {
  return resolveTenantPath(`data/medical-device/${rel}`);
}

function restoreEmptyLedgers(): void {
  for (const f of [
    "ledgers/adverse-event-records.yaml",
    "ledgers/capa-records.yaml",
    "ledgers/complaint-records.yaml",
    "ledgers/authority-inquiry-records.yaml",
    "ledgers/change-control-records.yaml",
    "ledgers/document-control-records.yaml",
  ]) {
    const p = ledgerAbs(f);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, EMPTY_LEDGER, "utf-8");
  }
  const audit = ledgerAbs("audit.jsonl");
  if (existsSync(audit)) rmSync(audit);
}

describe("jp_medical_device module", () => {
  it("has production_ready manifest with new cli commands", () => {
    const manifest = loadModuleManifest("jp_medical_device");
    expect(manifest?.id).toBe("jp_medical_device");
    expect(manifest?.cli_commands).toContain("deadlines");
    expect(manifest?.cli_commands).toContain("capa");
    expect(manifest?.cli_commands).toContain("application");
    expect(manifest?.cli_commands).toContain("audit");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_medical_device");
  });

  it("validates mal tenant medical device data", () => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_medical_device — medical device QMS/GVP data OK");
    spy.mockRestore();
  });

  it("lists mah obligations including PMS", () => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceObligations({ role: "mah" });
    const joined = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(joined).toContain("OBL-GVP");
    expect(joined).toContain("OBL-PMS");
    spy.mockRestore();
  });

  it("reports ledger status on mal", () => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceLedgerStatus({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("台帳ステータス"))).toBe(true);
    spy.mockRestore();
  });

  it("lists application catalog", () => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceApplicationCatalog({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("certification"))).toBe(true);
    spy.mockRestore();
  });

  it("computes GVP due dates from seriousness", () => {
    const d = new Date("2026-01-01T12:00:00");
    d.setDate(d.getDate() + GVP_REPORT_LEAD_DAYS.death);
    expect(gvpReportDueOn("2026-01-01", "death")).toBe(d.toISOString().slice(0, 10));
  });

  it("scans deadlines without throwing", () => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceDeadlines({ all: true });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("期限"))).toBe(true);
    spy.mockRestore();
  });

  it("flags placeholder device fields for application completeness", () => {
    setTenantId("mal");
    process.env.STEWARD_TENANT = "mal";
    const result = assessApplicationForDeviceId("DEV-001", "certification");
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

describe("jp_medical_device ledger mutations (isolated restore)", () => {
  beforeEach(() => {
    process.env.STEWARD_TENANT = "mal";
    setTenantId("mal");
    restoreEmptyLedgers();
  });

  afterEach(() => {
    restoreEmptyLedgers();
  });

  it("adds AE, links CAPA bidirectionally, closes both", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceAeAdd({
      summary: "isolated ae",
      seriousness: "other",
      deviceId: "DEV-001",
      json: true,
    });
    const aeOut = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("gvp_due_on"));
    const ae = JSON.parse(aeOut!) as { entry: { id: string } };

    runJpMedicalDeviceCapaOpen({
      source: "ae",
      title: "isolated capa",
      sourceRef: ae.entry.id,
      json: true,
    });
    const capaOut = spy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('"source": "ae"') || s.includes('"source":"ae"'));
    const capa = JSON.parse(capaOut!) as { entry: { id: string } };

    const aeRow = loadLedgerEntries(findLedgerByType("adverse_event")!.data_file).find(
      (e) => e.id === ae.entry.id
    );
    expect(aeRow?.capa_id).toBe(capa.entry.id);

    updateLedgerEntry({
      type: "capa",
      id: capa.entry.id,
      patch: { root_cause: "process gap", action: "retrain" },
    });
    runJpMedicalDeviceLedgerClose({ type: "capa", id: capa.entry.id, json: true });
    runJpMedicalDeviceLedgerClose({ type: "adverse_event", id: ae.entry.id, json: true });
    spy.mockRestore();
  });

  it("ledger close cannot bypass CAPA effectiveness gate", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { entry } = addLedgerEntry({
      type: "capa",
      fields: {
        source: "audit",
        title: "gate",
        root_cause: "x",
        action: "y",
        effectiveness_check_on: "2026-09-01",
        effectiveness_result: "pending",
        status: "effectiveness_check",
      },
    });
    expect(() => assertCapaEntryCloseable(entry)).toThrow(MedicalDeviceGateError);
    expect(() =>
      closeLedgerEntry({ type: "capa", id: String(entry.id) })
    ).toThrow(MedicalDeviceGateError);
  });

  it("applies medical_device.capa_close approval to ledger", () => {
    const { entry } = addLedgerEntry({
      type: "capa",
      fields: {
        source: "audit",
        title: "approve-hook",
        root_cause: "x",
        action: "y",
        status: "pending_approval",
      },
    });
    const applied = applyMedicalDeviceApproval({
      approval_id: "APR-20260828-001",
      scope: "internal",
      status: "approved",
      proposed_at: new Date().toISOString(),
      proposed_by: "tester",
      subject_type: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subject_ref: String(entry.id),
      approver_id: "CEO",
    });
    expect(applied.applied).toBe(true);
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === entry.id)?.status
    ).toBe("closed");
  });

  it("humanApproveOrgApproval closes CAPA; reject restores prior status", () => {
    ensureProtocolSigningKey();
    const { entry } = addLedgerEntry({
      type: "capa",
      fields: {
        source: "audit",
        title: "e2e capa",
        root_cause: "x",
        action: "y",
        status: "effectiveness_check",
        effectiveness_check_on: "2026-09-01",
        effectiveness_result: "effective",
      },
    });
    const proposed = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: String(entry.id),
      proposedBy: "medical_device_regulatory",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: String(entry.id),
      approvalId: proposed.approval_id,
      op: "capa.propose_close",
    });

    const { approval } = humanApproveOrgApproval({
      approvalId: proposed.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      source: "cli",
    });
    expect(approval.status).toBe("approved");
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === entry.id)?.status
    ).toBe("closed");

    const { entry: entry2 } = addLedgerEntry({
      type: "capa",
      fields: {
        source: "audit",
        title: "reject capa",
        root_cause: "x",
        action: "y",
        status: "effectiveness_check",
        effectiveness_check_on: "2026-09-01",
        effectiveness_result: "effective",
      },
    });
    const proposed2 = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: String(entry2.id),
      proposedBy: "medical_device_regulatory",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: String(entry2.id),
      approvalId: proposed2.approval_id,
      op: "capa.propose_close",
    });
    rejectOrgApproval({
      approvalId: proposed2.approval_id,
      approverId: "段燕燕",
      reason: "need more root cause",
    });
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === entry2.id)?.status
    ).toBe("effectiveness_check");
    expect(listMedicalDeviceAudit({ op: "approval.revert" }).length).toBeGreaterThan(0);
  });

  it("approve/reject change + doc + gvp_report subjects", () => {
    ensureProtocolSigningKey();
    const chg = addLedgerEntry({
      type: "change_control",
      fields: { change_type: "process", title: "chg", risk_review: "ok" },
    });
    const chgProp = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement,
      subjectRef: String(chg.entry.id),
      proposedBy: "medical_device_regulatory",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.changeImplement,
      subjectRef: String(chg.entry.id),
      approvalId: chgProp.approval_id,
      op: "change.propose_implement",
    });
    humanApproveOrgApproval({
      approvalId: chgProp.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      source: "cli",
    });
    expect(
      loadLedgerEntries(findLedgerByType("change_control")!.data_file).find(
        (r) => r.id === chg.entry.id
      )?.status
    ).toBe("closed");

    const doc = recordDocumentControlRevision({ docId: "QMS-T", title: "test" });
    expect(doc.effective_on).toBeUndefined();
    const docProp = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision,
      subjectRef: String(doc.id),
      proposedBy: "medical_device_regulatory",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.docRevision,
      subjectRef: String(doc.id),
      approvalId: docProp.approval_id,
      pendingStatus: "in_review",
      op: "document.propose_approval",
    });
    humanApproveOrgApproval({
      approvalId: docProp.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      source: "cli",
    });
    const docRow = loadLedgerEntries(findLedgerByType("document_control")!.data_file).find(
      (r) => r.id === doc.id
    );
    expect(docRow?.status).toBe("approved");
    expect(docRow?.effective_on).toBe(currentDate());

    const ae = addLedgerEntry({
      type: "adverse_event",
      fields: { summary: "gvp", seriousness: "other" },
    });
    const gvpProp = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport,
      subjectRef: String(ae.entry.id),
      proposedBy: "medical_device_regulatory",
    });
    markPendingMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.gvpReport,
      subjectRef: String(ae.entry.id),
      approvalId: gvpProp.approval_id,
      op: "gvp.propose_report",
    });
    humanApproveOrgApproval({
      approvalId: gvpProp.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      source: "cli",
    });
    const aeAfter = loadLedgerEntries(findLedgerByType("adverse_event")!.data_file).find(
      (r) => r.id === ae.entry.id
    );
    expect(aeAfter?.status).toBe("in_progress");
    expect(aeAfter?.report_filed_on).toBeUndefined();
  });

  it("apply failure prevents approval finalize", () => {
    ensureProtocolSigningKey();
    const proposed = proposeMedicalDeviceApproval({
      subjectType: MEDICAL_DEVICE_APPROVAL_SUBJECTS.capaClose,
      subjectRef: "CAPA-MISSING-999",
      proposedBy: "medical_device_regulatory",
    });
    expect(() =>
      humanApproveOrgApproval({
        approvalId: proposed.approval_id,
        approverId: "段燕燕",
        operatorId: "OP-001",
        source: "cli",
      })
    ).toThrow(/not found|Apply failed|medical-device/);
  });

  it("ae mark-filed clears GVP deadline; complaint promotes to AE", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceAeAdd({
      summary: "file me",
      seriousness: "death",
      json: true,
    });
    const aeOut = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("gvp_due_on"));
    const ae = JSON.parse(aeOut!) as { entry: { id: string; gvp_due_on: string } };
    const before = collectMedicalDeviceDeadlines({ includeOk: true }).filter(
      (d) => d.kind === "gvp_report" && d.id === ae.entry.id
    );
    expect(before.length).toBe(1);
    runJpMedicalDeviceAeMarkFiled({ id: ae.entry.id, on: "2026-08-01", json: true });
    const after = collectMedicalDeviceDeadlines({ includeOk: true }).filter(
      (d) => d.kind === "gvp_report" && d.id === ae.entry.id
    );
    expect(after.length).toBe(0);

    const complaint = addLedgerEntry({
      type: "complaint",
      fields: { summary: "promo", reportable: true, device_id: "DEV-001" },
    });
    runJpMedicalDeviceComplaintPromoteAe({
      id: String(complaint.entry.id),
      seriousness: "serious",
      json: true,
    });
    const cRow = loadLedgerEntries(findLedgerByType("complaint")!.data_file).find(
      (r) => r.id === complaint.entry.id
    );
    expect(cRow?.ae_id).toBeTruthy();
    spy.mockRestore();
  });

  it("inquiry close requires response path", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { entry } = addLedgerEntry({
      type: "authority_inquiry",
      fields: { authority: "pmda", title: "no path" },
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => runJpMedicalDeviceInquiryClose({ id: String(entry.id) })).toThrow(/exit 1/);
    exitSpy.mockRestore();
    runJpMedicalDeviceInquirySetResponse({
      id: String(entry.id),
      path: "docs/x.md",
      json: true,
    });
    runJpMedicalDeviceInquiryClose({ id: String(entry.id), respondedOn: "2026-08-20", json: true });
    expect(
      loadLedgerEntries(findLedgerByType("authority_inquiry")!.data_file).find(
        (r) => r.id === entry.id
      )?.status
    ).toBe("closed");
  });

  it("integrity collector runs for enabled module", () => {
    const issues = collectMedicalDeviceIntegrityIssues();
    expect(Array.isArray(issues)).toBe(true);
  });

  it("escalates AE without work order and sets inquiry response path", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceAeAdd({
      summary: "esc ae",
      seriousness: "serious",
      json: true,
    });
    const aeOut = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("gvp_due_on"));
    const ae = JSON.parse(aeOut!) as { entry: { id: string } };
    runJpMedicalDeviceGvpEscalate({
      id: ae.entry.id,
      noWorkOrder: true,
      json: true,
    });
    expect(
      loadLedgerEntries(findLedgerByType("adverse_event")!.data_file).find((r) => r.id === ae.entry.id)
        ?.escalated_at
    ).toBeTruthy();

    runJpMedicalDeviceInquiryOpen({
      authority: "pmda",
      title: "test inquiry",
      json: true,
    });
    const inqOut = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('"authority"'));
    const inq = JSON.parse(inqOut!) as { entry: { id: string } };
    runJpMedicalDeviceInquirySetResponse({
      id: inq.entry.id,
      path: "docs/medical-device/applications/draft-response.md",
      json: true,
    });
    expect(
      loadLedgerEntries(findLedgerByType("authority_inquiry")!.data_file).find(
        (r) => r.id === inq.entry.id
      )?.response_draft_path
    ).toContain("draft-response.md");
    spy.mockRestore();
  });

  it("application draft requires --force for placeholder device", () => {
    const spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() =>
      runJpMedicalDeviceApplicationDraft({ kind: "certification", deviceId: "DEV-001" })
    ).toThrow(/exit 1/);
    exitSpy.mockRestore();
    runJpMedicalDeviceApplicationDraft({
      kind: "certification",
      deviceId: "DEV-001",
      force: true,
      json: true,
    });
    expect(spyLog.mock.calls.some((c) => String(c[0]).includes("--force"))).toBe(true);
    spyLog.mockRestore();
  });

  it("CAPA effectiveness schedule → record → close", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    runJpMedicalDeviceCapaOpen({
      source: "audit",
      title: "eff capa",
      json: true,
    });
    const capaOut = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('"entry"'));
    const capa = JSON.parse(capaOut!) as { entry: { id: string } };
    updateLedgerEntry({
      type: "capa",
      id: capa.entry.id,
      patch: { root_cause: "root", action: "fix" },
    });

    runJpMedicalDeviceCapaScheduleEffectiveness({
      id: capa.entry.id,
      on: "2026-09-15",
      json: true,
    });
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === capa.entry.id)
        ?.status
    ).toBe("effectiveness_check");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => runJpMedicalDeviceCapaClose({ id: capa.entry.id })).toThrow(/exit 1/);
    exitSpy.mockRestore();

    runJpMedicalDeviceCapaRecordEffectiveness({
      id: capa.entry.id,
      result: "effective",
      json: true,
    });
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === capa.entry.id)
        ?.effectiveness_result
    ).toBe("effective");

    runJpMedicalDeviceCapaClose({ id: capa.entry.id, json: true });
    expect(
      loadLedgerEntries(findLedgerByType("capa")!.data_file).find((r) => r.id === capa.entry.id)
        ?.status
    ).toBe("closed");
    spy.mockRestore();
  });
});
