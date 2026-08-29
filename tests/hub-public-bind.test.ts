import { afterEach, describe, expect, it } from "vitest";
import {
  assertHubPublicBindAllowed,
  hubPublicTlsRequired,
  isHubPublicBindHost,
  isHubPublicMode,
} from "../src/lib/hub/public-bind.js";
import { buildWitnessHubGaReport } from "../src/lib/hub/ga-check.js";

describe("Witness Hub public bind TLS", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("treats 0.0.0.0 as a public bind host", () => {
    expect(isHubPublicBindHost("0.0.0.0")).toBe(true);
    expect(isHubPublicBindHost("127.0.0.1")).toBe(false);
  });

  it("allows plaintext on loopback even when TLS is required", () => {
    process.env.ORGOS_HUB_REQUIRE_TLS = "1";
    expect(hubPublicTlsRequired()).toBe(true);
    expect(() =>
      assertHubPublicBindAllowed({ host: "127.0.0.1" }),
    ).not.toThrow();
  });

  it("rejects 0.0.0.0 without TLS when ORGOS_HUB_REQUIRE_TLS=1", () => {
    process.env.ORGOS_HUB_REQUIRE_TLS = "1";
    expect(() => assertHubPublicBindAllowed({ host: "0.0.0.0" })).toThrow(
      /Public Hub bind requires TLS/,
    );
  });

  it("allows 0.0.0.0 when cert and key are set", () => {
    process.env.ORGOS_HUB_PUBLIC = "1";
    expect(() =>
      assertHubPublicBindAllowed({
        host: "0.0.0.0",
        tlsCert: "/tmp/server.pem",
        tlsKey: "/tmp/server.key",
      }),
    ).not.toThrow();
  });
});

describe("Witness Hub GA checklist", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("passes deploy file gates (TLS material may be absent in CI)", () => {
    delete process.env.ORGOS_HUB_PUBLIC;
    const report = buildWitnessHubGaReport();
    expect(report.ok).toBe(true);
    expect(report.checks.find((row) => row.id === "compose-n4")?.pass).toBe(true);
    expect(report.checks.find((row) => row.id === "compose-mtls")?.pass).toBe(true);
    expect(report.checks.find((row) => row.id === "prometheus-scrape")?.pass).toBe(true);
  });

  it("makes tls-material blocking when ORGOS_HUB_PUBLIC=1", () => {
    process.env.ORGOS_HUB_PUBLIC = "1";
    expect(isHubPublicMode()).toBe(true);
    const report = buildWitnessHubGaReport();
    const tls = report.checks.find((row) => row.id === "tls-material");
    if (tls?.pass) {
      expect(report.ok).toBe(true);
    } else {
      expect(report.ok).toBe(false);
    }
  });
});
