/**
 * Playwright CDP helper — inject a virtual WebAuthn credential for prod passkey smoke.
 * Requires `.orgos/wire-console-webauthn-smoke.json` (written by run-wire-console-webauthn-smoke-server.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

interface WebAuthnSmokeFixture {
  rp_id: string;
  credential_id: string;
  credential_id_base64: string;
  private_key_base64: string;
  operator_id: string;
  settlement_credential_id_base64?: string;
  settlement_private_key_base64?: string;
}

export function loadWebAuthnSmokeFixture(): WebAuthnSmokeFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), ".orgos/wire-console-webauthn-smoke.json"), "utf-8")
  ) as WebAuthnSmokeFixture;
}

function loadVirtualAuthenticatorSignCount(credentialId: string): number {
  const path = join(process.cwd(), ".orgos/webauthn-sign-counts.json");
  if (!existsSync(path)) return 0;
  try {
    const doc = JSON.parse(readFileSync(path, "utf-8")) as { counts?: Record<string, number> };
    return doc.counts?.[credentialId] ?? 0;
  } catch {
    return 0;
  }
}

/** Install Chrome DevTools virtual authenticator + credential before navigating to Console. */
export async function installWebAuthnVirtualCredential(page: Page): Promise<void> {
  const fixture = loadWebAuthnSmokeFixture();
  const signCount = loadVirtualAuthenticatorSignCount(fixture.credential_id);
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
  const credential = {
    credentialId: fixture.credential_id_base64,
    isResidentCredential: false,
    privateKey: fixture.private_key_base64,
    rpId: fixture.rp_id,
    signCount,
  };
  try {
    await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  } catch {
    await cdp.send("WebAuthn.clearCredentials", { authenticatorId });
    await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  }
}

/** Cross-platform / hybrid authenticator for settlement passkey registration. */
export async function installHybridVirtualAuthenticator(page: Page): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

/** Pre-seeded settlement credential on the hybrid (USB) virtual authenticator for step-up E2E. */
export async function installSettlementVirtualCredential(
  page: Page,
  hybridAuthenticatorId: string,
): Promise<void> {
  const fixture = loadWebAuthnSmokeFixture();
  if (!fixture.settlement_credential_id_base64 || !fixture.settlement_private_key_base64) {
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const userHandle = Buffer.from(fixture.operator_id, "utf-8").toString("base64");
  const credential = {
    credentialId: fixture.settlement_credential_id_base64,
    isResidentCredential: true,
    privateKey: fixture.settlement_private_key_base64,
    rpId: fixture.rp_id,
    signCount: 0,
    userHandle,
  };
  try {
    await cdp.send("WebAuthn.addCredential", {
      authenticatorId: hybridAuthenticatorId,
      credential,
    });
  } catch {
    await cdp.send("WebAuthn.clearCredentials", { authenticatorId: hybridAuthenticatorId });
    await cdp.send("WebAuthn.addCredential", {
      authenticatorId: hybridAuthenticatorId,
      credential,
    });
  }
}
