import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHubStatusReport, readHubTlsStatus } from "../src/lib/hub/status.js";

describe("witness hub status", () => {
  const env = { ...process.env };

  beforeEach(() => {
    delete process.env.ORGOS_HUB_PUBLIC;
    delete process.env.ORGOS_HUB_REQUIRE_TLS;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  const offlineFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  it("allows loopback bind without TLS", async () => {
    const report = await buildHubStatusReport({
      host: "127.0.0.1",
      fetchImpl: offlineFetch,
    });
    expect(report.bind.public_host).toBe(false);
    expect(report.bind.allowed).toBe(true);
    expect(report.metrics.reachable).toBe(false);
    expect(report.ga.checks.length).toBeGreaterThanOrEqual(8);
  });

  it("blocks public bind with a reason when TLS is not usable", async () => {
    process.env.ORGOS_HUB_PUBLIC = "1";
    const tls = readHubTlsStatus();
    const report = await buildHubStatusReport({
      host: "0.0.0.0",
      fetchImpl: offlineFetch,
    });
    expect(report.bind.public_host).toBe(true);
    expect(report.bind.tls_required).toBe(true);
    if (tls.present && !tls.expired && !tls.error) {
      expect(report.bind.allowed).toBe(true);
    } else {
      expect(report.bind.allowed).toBe(false);
      expect(report.bind.blocked_reason).toBeTruthy();
    }
  });

  it("never exposes the private key contents", async () => {
    const report = await buildHubStatusReport({
      host: "127.0.0.1",
      fetchImpl: offlineFetch,
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE KEY");
  });
});
