import { describe, expect, it } from "vitest";
import { ELTAX_PACKAGE_SCHEMA, ETAX_PACKAGE_SCHEMA } from "../schemas/efiling/filing.js";
import { FilingException } from "../src/lib/efiling/errors.js";
import {
  assertSignatureChannel,
  assertSpecChannel,
  assertTransportChannel,
} from "../src/lib/efiling/channel.js";
import { runMockFilingLifecycle } from "../src/lib/efiling/lifecycle.js";
import { FilingStore } from "../src/lib/efiling/store.js";
import { assertEltaxProcedureAllowed } from "../src/lib/eltax/procedures.js";
import { generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { createReturnPackage } from "../src/lib/etax/return-package.js";

describe("eLTAX channel parity and isolation", () => {
  it("reaches receipt on the mock path and keeps real procedures unsupported", () => {
    const record = runMockFilingLifecycle({
      channel: "eltax",
      id: "EFILING-eltax-life",
      packageId: "PKG-eltax-life",
      taxpayerId: "TP",
      procedureCode: "EFILING-MOCK",
      taxYear: "FY2026",
      revision: 0,
      payload: { n: 1 },
      specVersion: "test",
      idempotencyKey: "eltax-life",
      now: "2026-09-21T00:00:00.000Z",
    });
    expect(record.status).toBe("RECEIVED_BY_ETAX");
    expect(record.schema).toBe(ELTAX_PACKAGE_SCHEMA);
    expect(() => assertEltaxProcedureAllowed("RHO0010")).toThrow(/UNSUPPORTED/);
  });

  it("refuses cross-channel store, spec, transport, and signature", () => {
    expect(() => new FilingStore({ channel: "eltax", rootPath: "/var/etax/state" })).toThrow(
      FilingException
    );
    const store = new FilingStore({ channel: "eltax", now: "2026-09-21T00:00:00.000Z" });
    expect(() =>
      store.create({
        id: "EFILING-cross",
        packageId: "PKG-cross",
        taxpayerId: "TP",
        procedureCode: "EFILING-MOCK",
        taxYear: "FY2026",
        revision: 0,
        payload: {},
        sourceReferences: [],
        specVersion: "test",
        idempotencyKey: "cross",
        schema: ETAX_PACKAGE_SCHEMA,
      })
    ).toThrow(/cannot be stored/);
    expect(() => assertTransportChannel("etax", "eltax")).toThrow(FilingException);
    expect(() => assertSignatureChannel("eltax", "etax")).toThrow(FilingException);
    expect(() => assertSpecChannel("etax", "eltax")).toThrow(FilingException);
  });

  it("refuses to generate e-Tax XML from an eLTAX package", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP",
        procedureCode: "RHO0010",
        taxYear: "FY2026",
        revision: 0,
        createdBy: "test",
        payload: { schema: ELTAX_PACKAGE_SCHEMA },
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-eltax-reject", now: "2026-09-21T00:00:00.000Z" }
    );
    expect(() => generateOfficialXml(pkg)).toThrow(/eLTAX/);
  });
});
