/**
 * Passkey field / production readiness probes (HTTP + local state).
 * Manual Touch ID / hybrid steps remain in passkey-field-validation-log.md.
 */

import { existsSync, statSync } from "node:fs";
import {
  validateDeployUrlMatchesWebAuthn,
  type WebAuthnPublicConfig,
} from "../../console-auth/settlement-passkey-prod.js";
import { runProdAuthChecks, type ProdAuthCheck } from "../../console-auth/prod-checklist.js";
import { probeWebAuthnChallengeStore } from "./webauthn-challenge-store.js";
import { WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH } from "../paths.js";

export interface PasskeyFieldCheckRow {
  id: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
  manual?: boolean;
}

export interface PasskeyFieldCheckResult {
  url: string;
  ok: boolean;
  rows: PasskeyFieldCheckRow[];
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { redirect: "follow" });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function credentialFileModeCheck(): PasskeyFieldCheckRow {
  const path = WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH;
  if (!existsSync(path)) {
    return {
      id: "credential_file_mode",
      ok: true,
      warn: true,
      detail: "credential store not created yet (expected before first registration)",
    };
  }
  const mode = statSync(path).mode & 0o777;
  return {
    id: "credential_file_mode",
    ok: mode === 0o600,
    detail: mode === 0o600 ? "credential store mode 0600" : `credential store mode ${mode.toString(8)} (expected 600)`,
  };
}

export async function runPasskeyFieldCheck(opts: {
  url: string;
  scope?: "chat" | "wire" | "all";
}): Promise<PasskeyFieldCheckResult> {
  const base = opts.url.replace(/\/$/, "");
  const rows: PasskeyFieldCheckRow[] = [];

  const health = await fetchJson(`${base}/health`);
  rows.push({
    id: "health",
    ok: health.status === 200,
    detail: health.status === 200 ? "GET /health → 200" : `GET /health → ${health.status}`,
  });

  const config = await fetchJson(`${base}/chat/v1/auth/config`);
  const cfgBody = config.body as {
    mode?: string;
    webauthn?: WebAuthnPublicConfig;
  } | null;
  rows.push({
    id: "auth_config",
    ok: config.status === 200 && Boolean(cfgBody?.webauthn),
    detail:
      config.status === 200 && cfgBody?.webauthn
        ? `auth config mode=${cfgBody.mode ?? "?"}`
        : `GET /chat/v1/auth/config failed (${config.status})`,
  });

  if (cfgBody?.webauthn) {
    const mismatches = validateDeployUrlMatchesWebAuthn(base, cfgBody.webauthn);
    rows.push({
      id: "webauthn_origin_match",
      ok: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? `webauthn origin/rp_id match deploy URL (${cfgBody.webauthn.origin})`
          : mismatches.join("; "),
    });
    rows.push({
      id: "settlement_count",
      ok: (cfgBody.webauthn.settlement_count ?? 0) >= 0,
      warn: (cfgBody.webauthn.settlement_count ?? 0) === 0,
      detail:
        (cfgBody.webauthn.settlement_count ?? 0) > 0
          ? `settlement passkeys registered (${cfgBody.webauthn.settlement_count})`
          : "settlement_count=0 — register iPhone hybrid passkey after login",
      manual: (cfgBody.webauthn.settlement_count ?? 0) === 0,
    });
  }

  rows.push(credentialFileModeCheck());

  const challengeProbe = probeWebAuthnChallengeStore();
  rows.push({
    id: "challenge_store",
    ok: challengeProbe.ok,
    detail: challengeProbe.detail,
  });

  const doctorChecks = runProdAuthChecks(opts.scope ?? "all").filter((c) =>
    /passkey|webauthn|settlement_challenge|secure_cookie|bootstrap/i.test(c.id),
  );
  for (const check of doctorChecks) {
    rows.push(prodCheckToRow(check));
  }

  rows.push(
    {
      id: "manual_touch_id_login",
      ok: false,
      warn: true,
      detail: "Mac Touch ID login on this host (operator checklist #2)",
      manual: true,
    },
    {
      id: "manual_hybrid_settlement",
      ok: false,
      warn: true,
      detail: "iPhone hybrid settlement registration + tier B step-up (checklist #3)",
      manual: true,
    },
  );

  const automated = rows.filter((r) => !r.manual);
  const ok = automated.every((r) => r.ok);
  return { url: base, ok, rows };
}

function prodCheckToRow(check: ProdAuthCheck): PasskeyFieldCheckRow {
  return {
    id: `doctor_${check.id}`,
    ok: check.ok,
    warn: Boolean(check.warn),
    detail: check.detail,
  };
}

export function formatPasskeyFieldCheck(result: PasskeyFieldCheckResult): string {
  const lines = [`Passkey field check · ${result.url}`, ""];
  for (const row of result.rows) {
    const tag = row.manual ? "manual" : row.ok ? "ok" : row.warn ? "warn" : "fail";
    lines.push(`[${tag}] ${row.id}: ${row.detail}`);
  }
  lines.push("", result.ok ? "Automated checks: PASS" : "Automated checks: FAIL");
  lines.push("Manual steps: docs/org-os/passkey-field-validation-log.md");
  return lines.join("\n");
}
