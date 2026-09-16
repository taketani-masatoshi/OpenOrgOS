import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildSecretaryWorkbench } from "../src/lib/secretary-workbench/build-workbench.js";

describe("buildSecretaryWorkbench", () => {
  it("returns composed workbench for mal tenant", () => {
    setTenantId("mal");
    const wb = buildSecretaryWorkbench();
    expect(wb.ok).toBe(true);
    expect(wb.tenant).toBe("mal");
    expect(wb.company_name.length).toBeGreaterThan(0);
    expect(wb.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(wb.mail)).toBe(true);
    expect(Array.isArray(wb.drafts)).toBe(true);
    expect(Array.isArray(wb.tasks)).toBe(true);
    expect(Array.isArray(wb.approvals)).toBe(true);
    expect(wb.company).toMatchObject({
      mail_pending: expect.any(Number),
      mail_action_required: expect.any(Number),
      approvals_pending: expect.any(Number),
      tasks_open: expect.any(Number),
      tasks_p0: expect.any(Number),
      candidates: expect.any(Number),
    });
    // L1 surface: no body fields on mail/draft rows
    for (const row of wb.mail) {
      expect(row).toHaveProperty("subject");
      expect(row).toHaveProperty("from_label");
      expect(row).not.toHaveProperty("body");
      expect(row.href.startsWith("/secretary/workbench")).toBe(true);
      expect(row.href.includes("/wire/")).toBe(false);
    }
    for (const row of wb.drafts) {
      expect(row).toHaveProperty("subject");
      expect(row).toHaveProperty("to_label");
      expect(row).not.toHaveProperty("body");
      expect(row.href.includes("/wire/")).toBe(false);
    }
    if (wb.mail_setup) {
      expect(typeof wb.mail_setup.ready).toBe("boolean");
      expect(Array.isArray(wb.mail_setup.issues)).toBe(true);
    }
  });
});
