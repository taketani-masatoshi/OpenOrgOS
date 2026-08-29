import { afterEach, describe, expect, it } from "vitest";
import {
  defaultReimbursementDueOn,
  evaluateExpenseClaimDeadline,
} from "../src/lib/finance/expense-claim.js";
import {
  ClaimPersonMismatchError,
  isClaimOnlySeat,
  resolveIngestPersonId,
  resolveOperatorClaimPersonId,
} from "../src/lib/org/operator-claim-person.js";
import { resolveEffectiveOperatorAccess } from "../src/lib/org/operator-effective.js";
import type { OperatorRecord } from "../schemas/org/operator.js";
import {
  resetRuntimeContext,
  setRuntimeContext,
} from "../src/lib/runtime-context.js";

function seat(overrides: Partial<OperatorRecord>): OperatorRecord {
  return {
    operator_id: "OP-TEST",
    display_name: "テスト席",
    role: "employee",
    status: "active",
    seat_kind: "standard",
    ...overrides,
  } as OperatorRecord;
}

describe("expense-claim deadline", () => {
  afterEach(() => {
    resetRuntimeContext();
  });

  it("marks submissions after 30 days as late", () => {
    const fixed = new Date("2026-02-15T00:00:00.000Z");
    setRuntimeContext({
      clock: {
        now: () => fixed,
        nowMs: () => fixed.getTime(),
        nowIso: () => fixed.toISOString(),
      },
    });
    const result = evaluateExpenseClaimDeadline("2026-01-01");
    expect(result.deadline_status).toBe("late");
    expect(result.days_after_transaction).toBeGreaterThan(30);
  });

  it("keeps on-time submissions within 30 days", () => {
    const fixed = new Date("2026-07-10T00:00:00.000Z");
    setRuntimeContext({
      clock: {
        now: () => fixed,
        nowMs: () => fixed.getTime(),
        nowIso: () => fixed.toISOString(),
      },
    });
    const result = evaluateExpenseClaimDeadline("2026-07-01");
    expect(result.deadline_status).toBe("on_time");
    expect(result.days_after_transaction).toBe(9);
  });
});

describe("reimbursement due date default", () => {
  it("is the next Friday, so the claimant never has to ask", () => {
    // Wednesday 2026-08-26 → Friday 2026-08-28
    expect(defaultReimbursementDueOn(new Date("2026-08-26T00:00:00.000Z"))).toBe(
      "2026-08-28",
    );
  });

  it("moves to the following week when today is Friday", () => {
    expect(defaultReimbursementDueOn(new Date("2026-08-28T00:00:00.000Z"))).toBe(
      "2026-09-04",
    );
  });
});

describe("employee claim seat", () => {
  it("grants only expense:claim by role", () => {
    const access = resolveEffectiveOperatorAccess(seat({}));
    expect(access.permissions).toEqual(["expense:claim"]);
  });

  it("treats an approving seat as not claim-only", () => {
    expect(isClaimOnlySeat(seat({ role: "ceo" }))).toBe(false);
    expect(isClaimOnlySeat(seat({}))).toBe(true);
  });

  it("binds the mal employee seat to its budget person", () => {
    expect(
      resolveOperatorClaimPersonId(
        seat({ operator_id: "OP-003", person_id: "business-unit" }),
      ),
    ).toBe("business-unit");
  });

  it("pins ingest to the seat's own person", () => {
    const employee = seat({
      operator_id: "OP-003",
      person_id: "business-unit",
    });
    expect(resolveIngestPersonId(employee, "")).toBe("business-unit");
    expect(resolveIngestPersonId(employee, "business-unit")).toBe(
      "business-unit",
    );
    expect(() => resolveIngestPersonId(employee, "admin-unit")).toThrow(
      ClaimPersonMismatchError,
    );
  });

  it("lets a manager seat file on behalf of a member", () => {
    const manager = seat({ operator_id: "OP-001", role: "ceo" });
    expect(resolveIngestPersonId(manager, "admin-unit")).toBe("admin-unit");
  });
});
