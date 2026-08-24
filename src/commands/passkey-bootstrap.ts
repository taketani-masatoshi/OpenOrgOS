import {
  consumePasskeyBootstrapToken,
  mintPasskeyBootstrapToken,
  verifyPasskeyBootstrapToken,
} from "../lib/wire-console/auth/passkey-bootstrap.js";
import { isProdSecurityMode } from "../lib/console-auth/operator-rbac.js";
import { listWebAuthnCredentialsByPurpose } from "../lib/wire-console/auth/webauthn-store.js";
import { rpId } from "../lib/wire-console/auth/webauthn-shared.js";

export function runPasskeyBootstrapMint(opts: {
  operatorId: string;
  ttl?: string;
  json?: boolean;
}): void {
  const minted = mintPasskeyBootstrapToken({
    operatorId: opts.operatorId,
    ttl: opts.ttl,
  });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          operator_id: opts.operatorId,
          expires_at: minted.expires_at,
          token: minted.token,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`Passkey bootstrap token for ${opts.operatorId} (expires ${minted.expires_at}):`);
  console.log(minted.token);
  console.log("\nStore this token securely — it is shown once.");
}

export function runPasskeyBootstrapStatus(opts: { json?: boolean }): void {
  const loginCount = listWebAuthnCredentialsByPurpose("login", { rpId: rpId() }).length;
  const payload = {
    production_mode: isProdSecurityMode(),
    login_credentials: loginCount,
    bootstrap_required:
      isProdSecurityMode() && loginCount === 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Production mode: ${payload.production_mode ? "yes" : "no"}`);
  console.log(`Login passkeys: ${payload.login_credentials}`);
  console.log(`Bootstrap token required: ${payload.bootstrap_required ? "yes" : "no"}`);
}

export function runPasskeyBootstrapVerify(opts: {
  operatorId: string;
  token: string;
  json?: boolean;
}): void {
  const result = verifyPasskeyBootstrapToken(opts.token, opts.operatorId);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`Token valid for ${result.operator_id}`);
  } else {
    console.error(result.error);
    process.exitCode = 1;
  }
}

export { consumePasskeyBootstrapToken, verifyPasskeyBootstrapToken };
