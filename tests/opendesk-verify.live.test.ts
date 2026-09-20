import { describe, expect, it } from "vitest";
import { verifyOpendeskPorts } from "../src/lib/integrations/opendesk-verify.js";

const live = process.env.ORGOS_OPENDESK_VERIFY === "1";

describe.skipIf(!live)("opendesk live verify", () => {
  it("reaches Matrix, Nextcloud, and Keycloak on the local stack", async () => {
    const report = await verifyOpendeskPorts({ oxInclusion: "stub_unconfirmed" });
    expect(report.matrix.ok, report.matrix.reason).toBe(true);
    expect(report.nextcloud.ok, report.nextcloud.reason).toBe(true);
    expect(report.keycloak.ok, report.keycloak.reason).toBe(true);
    expect(report.ox.ok).toBe(false);
  });
});
