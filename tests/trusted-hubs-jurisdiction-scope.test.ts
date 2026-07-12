import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { validateTrustedHubsRegistry } from "../src/lib/protocol/trusted-hubs.js";

describe("trusted hubs jurisdiction scope (F11)", () => {
  const prevStrict = process.env.ORGOS_STRICT_TRUST;
  const prevFilter = process.env.ORGOS_STRICT_TRUST_JURISDICTIONS;
  const prevAll = process.env.ORGOS_TRUSTED_HUBS_VALIDATE_ALL;

  beforeEach(() => {
    setTenantId("mal");
    delete process.env.ORGOS_STRICT_TRUST;
    delete process.env.ORGOS_STRICT_TRUST_JURISDICTIONS;
    delete process.env.ORGOS_TRUSTED_HUBS_VALIDATE_ALL;
  });

  afterEach(() => {
    if (prevStrict === undefined) delete process.env.ORGOS_STRICT_TRUST;
    else process.env.ORGOS_STRICT_TRUST = prevStrict;
    if (prevFilter === undefined) delete process.env.ORGOS_STRICT_TRUST_JURISDICTIONS;
    else process.env.ORGOS_STRICT_TRUST_JURISDICTIONS = prevFilter;
    if (prevAll === undefined) delete process.env.ORGOS_TRUSTED_HUBS_VALIDATE_ALL;
    else process.env.ORGOS_TRUSTED_HUBS_VALIDATE_ALL = prevAll;
  });

  it("does not warn about empty keys outside tenant jurisdiction by default", () => {
    const result = validateTrustedHubsRegistry();
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "trusted-hub-missing-key")).toBe(false);
    expect(result.warnings.some((w) => /\/EE\//.test(w.message) || w.message.startsWith("EE/"))).toBe(
      false
    );
  });

  it("reports placeholder missing keys when validating all jurisdictions", () => {
    process.env.ORGOS_TRUSTED_HUBS_VALIDATE_ALL = "1";
    const result = validateTrustedHubsRegistry();
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "trusted-hub-missing-key")).toBe(true);
  });
});
