#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listOrgApprovals } from "../src/lib/org/approval/index.js";
import { proposeInterOrgWire } from "../src/lib/wire/notice-workflow.js";
import { runWithTenantId } from "../src/lib/tenant.js";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../src/lib/wire-console/paths.js";
import { writeWireConsoleWebAuthnSmokeFixture } from "../tests/helpers/wire-console-webauthn-e2e-fixture.js";
import { writeWireConsoleOidcSmokeFixture } from "../tests/helpers/wire-console-oidc-e2e-fixture.js";
import { resetWireConsoleTestTenant } from "../tests/helpers/wire-console-test-fixture.js";

function seedSettlementStepUpApproval(): void {
  runWithTenantId("wire-console-test", () => {
    const pending = listOrgApprovals({ scope: "wire" }).filter(
      (a) => a.status === "pending_approval" && a.amount?.value === 250_000,
    );
    if (pending.length > 0) return;
    proposeInterOrgWire({
      peerId: "PEER-001",
      transactionType: "payment.instructed",
      proposedBy: "OP-002",
      brokerInstruction: "BRO-E2E-SETTLE-001",
      amount: { value: 250_000, currency: "JPY" },
      message: "E2E settlement step-up tier B",
    });
  });
}

async function main(): Promise<void> {
  if (!existsSync(join(WIRE_CONSOLE_SPA_DIST, "index.html"))) {
    console.error("Wire Console SPA not built. Run: npm run wire-console:build");
    process.exit(1);
  }

  resetWireConsoleTestTenant();
  seedSettlementStepUpApproval();
  process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS = "1";
  process.env.ORGOS_SETTLEMENT_STEPUP = "1";
  process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "wire-console-webauthn-smoke-settlement-secret";
  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
  process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
  delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
  const port = Number(process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT ?? 9473);
  process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = `http://localhost:${port}`;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;

  writeWireConsoleWebAuthnSmokeFixture();
  await writeWireConsoleOidcSmokeFixture();

  const server = await startWireConsoleServer({ host: "localhost", port });
  console.log(`wire-console webauthn smoke server ${server.url}`);

  const shutdown = (): void => server.close();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise<void>(() => {
    /* keep alive for playwright webServer */
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
