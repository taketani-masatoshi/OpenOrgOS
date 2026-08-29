import { describe, expect, it, beforeEach } from "vitest";
import { getTenantId, setTenantId, runWithTenantId } from "../src/lib/tenant.js";
import { withWireConsoleTenant } from "../src/lib/wire-console/tenant-context.js";

describe("wire console tenant context", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("does not sticky-overwrite the process tenant after a Wire-scoped call", () => {
    expect(getTenantId()).toBe("mal");

    const seenInside = withWireConsoleTenant("aiac", () => getTenantId());
    expect(seenInside).toBe("aiac");

    // Chat / home tenant must remain mal (previous bug: setTenantId stole process state).
    expect(getTenantId()).toBe("mal");
  });

  it("nested ALS still restores the outer tenant", () => {
    setTenantId("mal");
    runWithTenantId("mal", () => {
      withWireConsoleTenant("aiac", () => {
        expect(getTenantId()).toBe("aiac");
      });
      expect(getTenantId()).toBe("mal");
    });
    expect(getTenantId()).toBe("mal");
  });
});
