import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createLedgerSignup } from "../src/lib/product/ledger-fleet.js";
import { handleStripeWebhookEvent } from "../src/lib/product/stripe-webhook.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { listLedgerMailOutbox } from "../src/lib/product/ledger-mail.js";
import { runWithTenantId } from "../src/lib/tenant.js";
import { loadOperatorRegistry } from "../src/lib/org/operators.js";
import { resolvePasskeyBootstrapOperator, verifyPasskeyBootstrapToken } from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { createWebAuthnRegisterOptions, verifyWebAuthnRegistration } from "../src/lib/wire-console/auth/webauthn-register.js";
import { createWebAuthnLoginOptions, getWebAuthnConfig, verifyWebAuthnLogin } from "../src/lib/wire-console/auth/webauthn.js";
import { mintTestWebAuthnAssertion, mintTestWebAuthnRegistration } from "../src/lib/wire-console/auth/webauthn-verify.js";
import { handleChatAuthApi } from "../src/lib/steward-chat/auth.js";
import { runWithWebAuthnOrigin } from "../src/lib/wire-console/auth/webauthn-origin.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";

describe("paid founder first Passkey", () => {
  const originalEnv = { ...process.env };
  let workspace = "";
  afterEach(() => {
    process.env = { ...originalEnv };
    refreshOrgOsPaths();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  it("connects webhook, token, sessionless registration, and first login", async () => {
    workspace = mkdtempSync(join(tmpdir(), "founder-passkey-flow-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    process.env.ORGOS_LEDGER_AUTO_PROVISION = "1";
    process.env.ORGOS_ENV = "development";
    process.env.WIRE_CONSOLE_AUTH = "dev";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://127.0.0.1:9471";
    process.env.ORGOS_PUBLIC_BASE_URL = "http://127.0.0.1:9471";
    delete process.env.ORGOS_MAIL_SMTP_URL;
    delete process.env.ORGOS_LEDGER_SMTP_URL;

    const signup = createLedgerSignup({
      tenantId: "founder-flow-001",
      companyName: "Founder Flow KK",
      adminEmail: "founder@flow.example",
      plan: "starter",
    });
    expect(await handleStripeWebhookEvent({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: signup.signup_id, customer: "cus_founder" } },
    })).toMatchObject({ handled: true, action: "provisioned" });
    await Promise.resolve();
    const mail = listLedgerMailOutbox().find((entry) => entry.kind === "provision_complete");
    expect(mail?.to).toBe("founder@flow.example");
    const setupUrl = new URL(mail!.body.match(/https?:\/\/\S+/)?.[0] ?? "");
    expect(setupUrl.pathname).toBe("/founder-setup/");
    const token = new URLSearchParams(setupUrl.hash.slice(1)).get("bootstrap")!;
    expect(token).toMatch(/^pkb_/);

    provisionLedgerTenant({
      tenantId: "founder-flow-other", companyName: "Other KK",
      adminEmail: "other@flow.example", plan: "starter",
    });
    expect(runWithTenantId("founder-flow-other", () =>
      verifyPasskeyBootstrapToken(token, "OP-001").ok,
    )).toBe(false);

    process.env.ORGOS_ENV = "production";
    process.env.WIRE_CONSOLE_AUTH = "prod";

    await runWithTenantId(signup.tenant_id, async () => {
      let responseStatus = 0;
      let responseBody = "";
      const response = {
        setHeader() {},
        writeHead(status: number) { responseStatus = status; },
        end(body: string) { responseBody = body; },
      } as unknown as ServerResponse;
      const handled = await handleChatAuthApi(
        {} as IncomingMessage, response, "/chat/v1/auth/webauthn/bootstrap", "POST",
        async () => JSON.stringify({ bootstrap_token: token }),
      );
      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      expect(JSON.parse(responseBody)).toMatchObject({
        operator_id: "OP-001", approver_id: "代表者",
      });
    });

    runWithTenantId(signup.tenant_id, () => runWithWebAuthnOrigin(setupUrl.origin, () => {
      expect(getWebAuthnConfig().origin).toBe(setupUrl.origin);
      const ceo = loadOperatorRegistry()!.operators[0]!;
      expect(ceo.email).toBe("founder@flow.example");
      expect(resolvePasskeyBootstrapOperator(token)).toBe(ceo.operator_id);
      expect(verifyPasskeyBootstrapToken(token, ceo.operator_id).ok).toBe(true);
      const approver = ceo.display_name;
      const options = createWebAuthnRegisterOptions({
        operator_id: ceo.operator_id,
        approver_id: approver,
        bootstrap_token: token,
      });
      expect("challenge" in options, JSON.stringify(options)).toBe(true);
      if (!("challenge" in options)) return;
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const registration = mintTestWebAuthnRegistration({
        rpId: "localhost", origin: setupUrl.origin,
        challenge: options.challenge, operator_id: ceo.operator_id,
        approver_id: approver, privateKey,
      });
      const registered = verifyWebAuthnRegistration({
        ...registration, challenge: options.challenge,
        operator_id: ceo.operator_id, approver_id: approver,
      });
      expect("token" in registered && registered.token).toBeTruthy();
      expect(resolvePasskeyBootstrapOperator(token)).toBeNull();
      const loginOptions = createWebAuthnLoginOptions();
      const assertion = mintTestWebAuthnAssertion({
        rpId: "localhost", origin: setupUrl.origin,
        challenge: loginOptions.challenge, credentialId: registration.credential_id,
        privateKey,
      });
      const loggedIn = verifyWebAuthnLogin({
        ...assertion, challenge: loginOptions.challenge,
      });
      expect("user" in loggedIn && loggedIn.user.operator_id).toBe(ceo.operator_id);
    }));
    expect(runWithTenantId("founder-flow-other", () =>
      createWebAuthnLoginOptions().allow_credentials,
    )).toEqual([]);
  });
});
