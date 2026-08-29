// @catalog-ids: jp_certification,jp_inspection,jp_medical_device
import { describe, expect, it } from "vitest";
import {
  listActiveCertTypeIds,
  startCertificationCase,
} from "../src/lib/certification-workflow.js";
import { scheduleInspection } from "../src/lib/inspection-workflow.js";
import {
  listCertificationGateGroups,
  listInspectionGateGroups,
} from "../src/lib/required-compliance.js";
import { listPermitOpeningBlockers } from "../src/lib/permit-opening-gate.js";

describe("certification / inspection fulfilment", () => {
  it("recommended certification is not in required gate groups", async () => {
    const { loadRequiredComplianceFile } = await import("../src/lib/required-compliance.js");
    const medical = loadRequiredComplianceFile("jp_medical_device");
    expect(medical?.requirements.some((r) => r.id === "rc-md-iso-13485")).toBe(true);
    expect(listCertificationGateGroups("jp_medical_device")).toEqual([]);
  });

  it("construction declares recommended ISO outside required gate", async () => {
    const { loadRequiredComplianceFile } = await import("../src/lib/required-compliance.js");
    const f = loadRequiredComplianceFile("construction");
    expect(f?.requirements.some((r) => r.fulfilment === "certification")).toBe(true);
    expect(listCertificationGateGroups("construction")).toEqual([]);
  });

  it("can dry-run start certification and schedule inspection", () => {
    const c = startCertificationCase({ type: "cert-iso-27001" });
    expect(c.cert.status).toBe("in_progress");
    expect(c.cert.id).toMatch(/^CERT-/);

    const i = scheduleInspection({
      type: "insp-fire-prevention",
      scheduledOn: "2026-08-01",
    });
    expect(i.inspection.status).toBe("scheduled");
  });

  it("gate API accepts certification/inspection fulfilment field", () => {
    const blockers = listPermitOpeningBlockers();
    for (const b of blockers) {
      expect(["license", "certification", "inspection", undefined]).toContain(b.fulfilment);
    }
    expect(listActiveCertTypeIds()).toBeInstanceOf(Set);
    expect(listInspectionGateGroups("hospitality")).toEqual([]);
  });
});
