import { describe, expect, it } from "vitest";
import { FilingException } from "../src/lib/efiling/errors.js";
import { assertMockProviderForbidden } from "../src/lib/efiling/lifecycle.js";
import { FilingStore } from "../src/lib/efiling/store.js";
import { evaluateProductionEnablement } from "../src/lib/etax/production-review.js";
import { EFILING_APPROVAL_SUBJECT, assertFilingHumanApproval } from "../src/lib/efiling/approval.js";

describe("efiling production fail-closed", () => {
  it("refuses a production store without an encrypted-storage declaration", () => {
    expect(() => new FilingStore({ channel: "etax", production: true })).toThrow(
      /encrypted storage/,
    );
    expect(
      () => new FilingStore({ channel: "etax", production: true, encryptedStorage: true }),
    ).not.toThrow();
  });

  it("refuses the mock provider outside mock and ignores ORGOS_ETAX_PRODUCTION", () => {
    expect(() => assertMockProviderForbidden("test")).toThrow(FilingException);
    expect(() => assertMockProviderForbidden("production")).toThrow(FilingException);
    expect(() => assertMockProviderForbidden("mock")).not.toThrow();
    process.env.ORGOS_ETAX_PRODUCTION = "1";
    try {
      expect(evaluateProductionEnablement().certified).toBe(false);
    } finally {
      delete process.env.ORGOS_ETAX_PRODUCTION;
    }
  });

  it("rejects an approval whose subject is not the package hash", () => {
    expect(() =>
      assertFilingHumanApproval({
        operatorId: "OP-MISSING",
        packageSha256: "sha256:" + "ab".repeat(32),
        approval: {
          approval_id: "APR-1",
          subject_type: EFILING_APPROVAL_SUBJECT,
          subject_ref: "sha256:" + "cd".repeat(32),
          proposed_by: "tester",
          status: "approved",
        } as never,
        context: {} as never,
      }),
    ).toThrow(/subject_ref/);
  });
});
