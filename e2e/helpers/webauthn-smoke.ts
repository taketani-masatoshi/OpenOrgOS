/**
 * Playwright CDP helper — inject a virtual WebAuthn credential for prod passkey smoke.
 * Requires `.orgos/wire-console-webauthn-smoke.json` (written by run-wire-console-webauthn-smoke-server.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

interface WebAuthnSmokeFixture {
  rp_id: string;
  credential_id_base64: string;
  private_key_base64: string;
  operator_id: string;
}

export function loadWebAuthnSmokeFixture(): WebAuthnSmokeFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), ".orgos/wire-console-webauthn-smoke.json"), "utf-8")
  ) as WebAuthnSmokeFixture;
}

/** Install Chrome DevTools virtual authenticator + credential before navigating to Console. */
export async function installWebAuthnVirtualCredential(page: Page): Promise<void> {
  const fixture = loadWebAuthnSmokeFixture();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: false,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await cdp.send("WebAuthn.addCredential", {
    authenticatorId,
    credential: {
      credentialId: fixture.credential_id_base64,
      isResidentCredential: false,
      privateKey: fixture.private_key_base64,
      rpId: fixture.rp_id,
      signCount: 0,
    },
  });
}
