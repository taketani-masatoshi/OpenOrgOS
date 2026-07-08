import { mkdirSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { mintTestOidcIdTokenRs256 } from "../../src/lib/wire-console/auth/oidc.js";
import { preloadOidcJwks } from "../../src/lib/wire-console/auth/oidc-jwks.js";
import { ORGOS_STATE_DIR, WIRE_CONSOLE_OIDC_SMOKE_FIXTURE } from "../../src/lib/wire-console/paths.js";

export { WIRE_CONSOLE_OIDC_SMOKE_FIXTURE };

export interface WireConsoleOidcSmokeFixture {
  id_token: string;
  operator_id: string;
  approver_id: string;
}

export async function writeWireConsoleOidcSmokeFixture(): Promise<WireConsoleOidcSmokeFixture> {
  process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://idp.test/orgos";
  process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "wire-console";

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  jwk.kid = "oidc-smoke-rsa";
  process.env.WIRE_CONSOLE_OIDC_JWKS_JSON = JSON.stringify({ keys: [jwk] });
  delete process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
  delete process.env.WIRE_CONSOLE_OIDC_JWKS_URL;
  await preloadOidcJwks();

  const operatorId = "E2E OIDC";
  const approverId = "テスト承認者";
  const idToken = mintTestOidcIdTokenRs256(privateKey, {
    sub: "oidc-smoke-user",
    kid: "oidc-smoke-rsa",
    operator_id: operatorId,
    approver_id: approverId,
  });

  const fixture: WireConsoleOidcSmokeFixture = {
    id_token: idToken,
    operator_id: operatorId,
    approver_id: approverId,
  };

  mkdirSync(ORGOS_STATE_DIR, { recursive: true });
  writeFileSync(WIRE_CONSOLE_OIDC_SMOKE_FIXTURE, JSON.stringify(fixture, null, 2), "utf-8");
  return fixture;
}
