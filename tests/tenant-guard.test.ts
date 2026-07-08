import { describe, it, expect, afterEach } from "vitest";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";

describe("tenant id hardening", () => {
  afterEach(() => {
    setTenantId("mal");
  });

  it("accepts a valid existing tenant id", () => {
    expect(() => setTenantId("demo")).not.toThrow();
    expect(getTenantDir()).toMatch(/tenants\/demo$/);
  });

  it("rejects path traversal via separators", () => {
    expect(() => setTenantId("../src")).toThrow(/Invalid tenant id/);
    expect(() => setTenantId("mal/../../etc")).toThrow(/Invalid tenant id/);
  });

  it("rejects absolute and dotted ids", () => {
    expect(() => setTenantId("/etc")).toThrow(/Invalid tenant id/);
    expect(() => setTenantId("..")).toThrow(/Invalid tenant id/);
  });

  it("rejects an unknown but syntactically valid tenant", () => {
    expect(() => setTenantId("does-not-exist")).toThrow(/Unknown tenant/);
  });
});

describe("tenant path lazy getters (REF-4b)", () => {
  afterEach(() => {
    setTenantId("mal");
  });

  it("resolves data/docs paths after setTenantId", () => {
    setTenantId("demo");
    expect(getDataDir()).toMatch(/tenants\/demo\/data$/);
    expect(getDocsDir()).toMatch(/tenants\/demo\/docs$/);
    setTenantId("acme");
    expect(getDataDir()).toMatch(/tenants\/acme\/data$/);
    expect(getDocsDir()).toMatch(/tenants\/acme\/docs$/);
  });
});
