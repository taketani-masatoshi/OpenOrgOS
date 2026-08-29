import { describe, expect, it } from "vitest";
import { buildClaimDeskPayload } from "../src/lib/steward-chat/routes/org-budget-api.js";
import { resolveOperatorPermissions } from "../src/lib/console-auth/operator-rbac.js";
import { findOperatorById } from "../src/lib/org/operators.js";
import {
  extractQrPayload,
} from "../apps/steward-chat/src/qrScan.js";
import { claimPlainStatus } from "../apps/steward-chat/src/claimSettlement.js";
import type { WireConsoleUser } from "../src/lib/wire-console/auth/session.js";

function session(operatorId: string): WireConsoleUser {
  return {
    operator_id: operatorId,
    approver_id: operatorId,
    mode: "prod",
  } as WireConsoleUser;
}

describe("employee claim desk (mal)", () => {
  it("shows only the seat's own envelope and claims", () => {
    const desk = buildClaimDeskPayload(session("OP-003"));
    expect(desk.ok).toBe(true);
    if (!desk.ok) return;
    expect(desk.person_id).toBe("business-unit");
    expect(desk.org_unit_id).toBe("business-unit");
    expect(desk.allocation_yen).toBeGreaterThan(0);
    expect(desk.remaining_yen).toBe(desk.allocation_yen - desk.actual_yen);
    expect(desk.categories.length).toBeGreaterThan(0);
    for (const claim of desk.claims) {
      expect(claim.person_id ?? desk.person_id).toBe(desk.person_id);
    }
  });

  it("keeps approval permissions away from employee seats", () => {
    const employee = findOperatorById("OP-003");
    expect(employee).toBeDefined();
    const permissions = resolveOperatorPermissions(employee!);
    expect(permissions).toContain("expense:claim");
    expect(permissions).not.toContain("chat:approve");
    expect(permissions).not.toContain("broker:transfer");
    expect(permissions).not.toContain("receipt:issue");
    expect(permissions).not.toContain("chat:read");
  });

  it("reports no envelope for a seat without one", () => {
    const desk = buildClaimDeskPayload(session("OP-002"));
    expect(desk.ok).toBe(false);
    if (desk.ok) return;
    expect(desk.code).toBe("no_envelope");
  });
});

describe("claim desk QR input", () => {
  it("accepts the signed JSON as-is", () => {
    expect(extractQrPayload(' {"receipt_id":"R-1"} ')).toBe(
      '{"receipt_id":"R-1"}',
    );
  });

  it("pulls the payload out of a claim URL", () => {
    expect(
      extractQrPayload("https://example.test/claim?payload=%7B%22a%22%3A1%7D"),
    ).toBe('{"a":1}');
    expect(extractQrPayload('https://example.test/claim#{"a":1}')).toBe(
      '{"a":1}',
    );
  });
});

describe("words the claimant sees", () => {
  it("never leaks gate names", () => {
    expect(claimPlainStatus("pending_approval")).toBe("waiting");
    expect(claimPlainStatus("rejected")).toBe("sent_back");
    expect(claimPlainStatus("pending_reimbursement")).toBe("passed");
    expect(claimPlainStatus("posted")).toBe("passed");
  });
});
