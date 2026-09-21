import { describe, expect, it } from "vitest";
import { ETAX_PACKAGE_SCHEMA } from "../schemas/efiling/filing.js";
import { FilingException } from "../src/lib/efiling/errors.js";
import { runMockFilingLifecycle } from "../src/lib/efiling/lifecycle.js";
import { canTransitionFiling } from "../src/lib/efiling/state-machine.js";
import { FilingStore } from "../src/lib/efiling/store.js";

describe("efiling core lifecycle and idempotency", () => {
  it("reaches receipt on the mock path for both channels", () => {
    for (const channel of ["etax", "eltax"] as const) {
      const record = runMockFilingLifecycle({
        channel,
        id: `EFILING-${channel}`,
        packageId: `PKG-${channel}`,
        taxpayerId: "TP",
        procedureCode: "EFILING-MOCK",
        taxYear: "FY2026",
        revision: 0,
        payload: { n: 1 },
        specVersion: "test",
        idempotencyKey: `key-${channel}`,
        now: "2026-09-21T00:00:00.000Z",
      });
      expect(record.status).toBe("RECEIVED_BY_ETAX");
      expect(record.receiptNumber).toBeTruthy();
    }
  });

  it("rejects an illegal transition and a slot collision", () => {
    expect(canTransitionFiling("DRAFT", "APPROVED")).toBe(false);
    const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z" });
    const created = store.create(row("a", "key-a"));
    store.save({ ...created, status: "GENERATED" }, created.writeRevision);
    expect(() => store.create(row("b", "key-b"))).toThrow(FilingException);
  });

  it("rejects idempotency reuse with a different package and a stale write", () => {
    const store = new FilingStore({ channel: "etax", now: "2026-09-21T00:00:00.000Z" });
    const created = store.create(row("a", "key"));
    expect(store.create(row("a", "key")).id).toBe(created.id);
    expect(() => store.create({ ...row("a", "key"), payload: { n: 2 } })).toThrow(
      /different package/
    );
    expect(() => store.save(created, 99)).toThrow(/stale/);
  });
});

function row(id: string, idempotencyKey: string) {
  return {
    id: `EFILING-${id}`,
    packageId: `PKG-${id}`,
    taxpayerId: "TP",
    procedureCode: "EFILING-MOCK",
    taxYear: "FY2026",
    revision: 0,
    payload: { n: 1 },
    sourceReferences: [],
    specVersion: "test",
    idempotencyKey,
    schema: ETAX_PACKAGE_SCHEMA,
  };
}
