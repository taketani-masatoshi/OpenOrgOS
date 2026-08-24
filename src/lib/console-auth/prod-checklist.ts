import { existsSync } from "node:fs";
import { operatorsRegistryPath, registryHasApprovers } from "../org/operators.js";
import { validateWebAuthnProdEnv } from "./settlement-passkey-prod.js";
import {
  hasUnusedPasskeyBootstrapToken,
} from "../wire-console/auth/passkey-bootstrap.js";
import {
  listWebAuthnCredentialsByPurpose,
} from "../wire-console/auth/webauthn-store.js";
import { probeWebAuthnChallengeStore } from "../wire-console/auth/webauthn-challenge-store.js";
import { rpId } from "../wire-console/auth/webauthn-shared.js";
import { listFsGuardSkillCliExceptions } from "../org/fs-guard/skill-cli-policy.js";
import { isFsGuardInitialized } from "../org/fs-guard/store.js";

export interface ProdAuthCheck {
  id: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
}

function isProdMode(): boolean {
  return (
    process.env.ORGOS_ENV === "production" ||
    process.env.ORGOS_PROD === "1" ||
    process.env.NODE_ENV === "production"
  );
}

function hostLooksPublic(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  return h !== "127.0.0.1" && h !== "localhost" && h !== "::1" && h !== "0.0.0.0";
}

export function runProdAuthChecks(scope: "chat" | "wire" | "all" = "all"): ProdAuthCheck[] {
  const checks: ProdAuthCheck[] = [];
  const prod = isProdMode();
  const host =
    process.env.STEWARD_CHAT_HOST?.trim() ||
    process.env.WIRE_CONSOLE_HOST?.trim() ||
    process.env.OPERATOR_CONSOLE_HOST?.trim();

  if (scope === "chat" || scope === "all") {
    const authOff = process.env.STEWARD_CHAT_AUTH === "0";
    checks.push({
      id: "chat_auth_enabled",
      ok: !authOff,
      warn: authOff,
      detail: authOff
        ? "STEWARD_CHAT_AUTH=0 — authentication disabled"
        : "Steward Chat auth enabled",
    });
  }

  const devPasskey = process.env.WIRE_CONSOLE_DEV_PASSKEY?.trim();
  checks.push({
    id: "dev_passkey_disabled",
    ok: prod ? !devPasskey : true,
    warn: prod && Boolean(devPasskey),
    detail:
      prod && devPasskey
        ? "WIRE_CONSOLE_DEV_PASSKEY set in production — remove and use WebAuthn/OIDC"
        : devPasskey
          ? "Dev passkey enabled (ok for local dev)"
          : "Dev passkey not configured",
  });

  const secureCookie =
    process.env.ORGOS_COOKIE_SECURE === "1" || process.env.STEWARD_CHAT_SECURE === "1";
  const needsSecure = hostLooksPublic(host);
  checks.push({
    id: "secure_cookie",
    ok: !needsSecure || secureCookie,
    warn: needsSecure && !secureCookie,
    detail:
      needsSecure && !secureCookie
        ? `Public host ${host} without ORGOS_COOKIE_SECURE=1 — session cookies may leak`
        : secureCookie
          ? "Secure cookies enabled"
          : "Local host — secure cookie optional",
  });

  const persistOff = process.env.ORGOS_SESSION_PERSIST === "0";
  checks.push({
    id: "session_persist",
    ok: !prod || !persistOff,
    warn: prod && persistOff,
    detail:
      prod && persistOff
        ? "ORGOS_SESSION_PERSIST=0 in production — sessions lost on restart"
        : persistOff
          ? "In-memory sessions (ok for tests)"
          : "Session persistence enabled",
  });

  const llmMock = process.env.ORGOS_LLM_MOCK === "1";
  checks.push({
    id: "llm_mock_disabled",
    ok: !prod || !llmMock,
    warn: prod && llmMock,
    detail:
      prod && llmMock
        ? "ORGOS_LLM_MOCK=1 in production — Operator replies are mocked"
        : llmMock
          ? "LLM mock enabled (ok for dev/test)"
          : "LLM mock disabled",
  });

  if (scope === "all") {
    const mcpAuthOff = process.env.ORGOS_MCP_AUTH === "0";
    const mcpToken = process.env.ORGOS_MCP_TOKEN?.trim();
    checks.push({
      id: "mcp_token",
      ok: prod ? !mcpAuthOff && Boolean(mcpToken) : mcpAuthOff || Boolean(mcpToken),
      warn: !prod && !mcpAuthOff && !mcpToken,
      detail:
        mcpAuthOff && prod
          ? "ORGOS_MCP_AUTH=0 in production — MCP must use token auth"
          : mcpAuthOff
            ? "MCP auth disabled (ORGOS_MCP_AUTH=0 — dev only)"
            : mcpToken
              ? "MCP token configured"
              : "ORGOS_MCP_TOKEN unset — set before exposing MCP in production",
    });
  }

  if ((scope === "wire" || scope === "all") && prod) {
    const wireDev = process.env.WIRE_CONSOLE_AUTH !== "prod";
    checks.push({
      id: "wire_console_auth_prod",
      ok: !wireDev,
      detail: wireDev
        ? "WIRE_CONSOLE_AUTH must be prod in production — dev passkey login is not allowed"
        : "Wire Console production auth enabled",
    });

    const webauthnRows = validateWebAuthnProdEnv({ host });
    const ids = [
      "webauthn_rp_id",
      "webauthn_origin",
      "webauthn_origin_https",
      "webauthn_rp_origin_match",
      "webauthn_no_deprecated_settlement_rp",
    ] as const;
    webauthnRows.forEach((row, i) => {
      const id = ids[i] ?? `webauthn_env_${i}`;
      const deprecatedWarn =
        id === "webauthn_no_deprecated_settlement_rp" && row.detail.startsWith("WARN:");
      checks.push({
        id,
        ok: deprecatedWarn ? true : row.ok,
        warn: deprecatedWarn,
        detail: deprecatedWarn ? row.detail.replace(/^WARN: /, "") : row.detail,
      });
    });
  }

  if (prod) {
    const hasRegistry = existsSync(operatorsRegistryPath());
    checks.push({
      id: "operator_registry",
      ok: hasRegistry && registryHasApprovers(),
      detail: hasRegistry
        ? registryHasApprovers()
          ? "Operator registry with approver role configured"
          : "operators.yaml exists but no ceo/approver — add at least one approver"
        : "data/org/operators.yaml missing — run: orgos operator init-registry",
    });

    checks.push({
      id: "operator_auth_cli",
      ok: process.env.STEWARD_OPERATOR_AUTH !== "0",
      detail:
        process.env.STEWARD_OPERATOR_AUTH === "0"
          ? "STEWARD_OPERATOR_AUTH=0 in production — CLI mutations unauthenticated"
          : "CLI operator auth enabled (default)",
    });
  }

  if (scope === "chat" || scope === "all") {
    const csrfOff = process.env.ORGOS_CSRF === "0";
    checks.push({
      id: "csrf_enabled",
      ok: prod ? !csrfOff : true,
      warn: prod && csrfOff,
      detail:
        prod && csrfOff
          ? "ORGOS_CSRF=0 in production — Origin/Referer validation disabled"
          : csrfOff
            ? "CSRF guard disabled (ok for tests)"
            : "CSRF Origin/Referer guard enabled",
    });

    const auditOff = process.env.ORGOS_CHAT_AUDIT === "0";
    checks.push({
      id: "chat_audit_enabled",
      ok: prod ? !auditOff : true,
      warn: prod && auditOff,
      detail:
        prod && auditOff
          ? "ORGOS_CHAT_AUDIT=0 in production — Chat operations not audited"
          : auditOff
            ? "Chat audit disabled (ok for tests)"
            : "Chat operation audit logging enabled",
    });

    const settlementOff = process.env.ORGOS_SETTLEMENT_STEPUP === "0";
    checks.push({
      id: "settlement_stepup_enabled",
      ok: prod ? !settlementOff : true,
      warn: prod && settlementOff,
      detail:
        prod && settlementOff
          ? "ORGOS_SETTLEMENT_STEPUP=0 in production — tier B/C PassKey step-up disabled (ADR 0037)"
          : settlementOff
            ? "Settlement step-up disabled (ok for local/dev tests)"
            : "Settlement PassKey step-up enabled for tier B/C",
    });

    const rateLimitOff = process.env.ORGOS_RATE_LIMIT === "0";
    checks.push({
      id: "rate_limit_enabled",
      ok: prod ? !rateLimitOff : true,
      warn: prod && rateLimitOff,
      detail:
        prod && rateLimitOff
          ? "ORGOS_RATE_LIMIT=0 in production — API rate limiting disabled"
          : rateLimitOff
            ? "Rate limit disabled (ok for tests)"
            : "HTTP rate limiting enabled",
    });
  }

  const llmWrite = process.env.ORGOS_LLM_TOOLS_WRITE === "1";
  checks.push({
    id: "llm_tools_write_disabled",
    ok: !prod || !llmWrite,
    warn: prod && llmWrite,
    detail:
      prod && llmWrite
        ? "ORGOS_LLM_TOOLS_WRITE=1 in production — LLM must not execute approvals or ledger writes"
        : llmWrite
          ? "LLM write tools enabled (ok for local/dev; never includes operator_approve)"
          : "LLM write tools disabled",
  });

  const hacSecret = Boolean(process.env.ORGOS_HUMAN_APPROVAL_SECRET?.trim());
  checks.push({
    id: "human_approval_secret",
    ok: true,
    warn: prod && !hacSecret,
    detail:
      prod && !hacSecret
        ? "ORGOS_HUMAN_APPROVAL_SECRET missing in production — HumanApprovalContext HMAC is unbound"
        : hacSecret
          ? "HumanApprovalContext HMAC secret is set"
          : "HumanApprovalContext uses the development HMAC secret",
  });

  if (prod) {
    const openBootstrap = process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP === "1";
    checks.push({
      id: "passkey_open_bootstrap_disabled",
      ok: !openBootstrap,
      detail: openBootstrap
        ? "WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP=1 is forbidden in production"
        : "Open bootstrap disabled (production default)",
    });

    let loginCount = 0;
    try {
      loginCount = listWebAuthnCredentialsByPurpose("login", { rpId: rpId() }).length;
    } catch {
      loginCount = -1;
    }
    const bootstrapReady =
      loginCount > 0 || hasUnusedPasskeyBootstrapToken();
    checks.push({
      id: "passkey_bootstrap_ready",
      ok: loginCount !== -1 && bootstrapReady,
      warn: loginCount === 0 && !hasUnusedPasskeyBootstrapToken(),
      detail:
        loginCount === -1
          ? "WebAuthn credential store unreadable — fix before first login registration"
          : loginCount > 0
            ? `Login passkeys registered (${loginCount})`
            : hasUnusedPasskeyBootstrapToken()
              ? "Bootstrap token minted and unused — ready for first registration"
              : "No login passkey and no bootstrap token — mint: orgos operator passkey-bootstrap mint",
    });

    const settlementSecret = Boolean(process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET?.trim());
    checks.push({
      id: "settlement_challenge_secret",
      ok: settlementSecret,
      detail: settlementSecret
        ? "Settlement challenge HMAC secret configured"
        : "ORGOS_SETTLEMENT_CHALLENGE_SECRET required in production",
    });

    const webauthnTestSecret = Boolean(process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET?.trim());
    const allowTestSecret = process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET === "1";
    checks.push({
      id: "webauthn_test_secret_disabled",
      ok: !webauthnTestSecret && !allowTestSecret,
      detail:
        webauthnTestSecret || allowTestSecret
          ? "WIRE_CONSOLE_WEBAUTHN_TEST_SECRET / ALLOW_TEST_SECRET forbidden in production"
          : "WebAuthn test secret bypass disabled",
    });

    const challengeProbe = probeWebAuthnChallengeStore();
    checks.push({
      id: "webauthn_challenge_store",
      ok: challengeProbe.ok,
      detail: challengeProbe.ok
        ? challengeProbe.detail
        : `${challengeProbe.detail} — ensure shared .orgos volume across workers (ADR 0042)`,
    });

    const skillExceptions = listFsGuardSkillCliExceptions();
    checks.push({
      id: "fs_guard_skill_cli_exceptions",
      ok: true,
      warn: skillExceptions.length > 0,
      detail:
        skillExceptions.length > 0
          ? `${skillExceptions.length} Skill CLI commands still bypass guard apply (see docs/org-os/fs-guard-skill-cli-policy.md)`
          : "All Skill CLI mutations routed through fs-guard",
    });

    const guardOff = process.env.ORGOS_FS_GUARD === "off";
    const guardInit = isFsGuardInitialized();
    checks.push({
      id: "fs_guard_initialized",
      ok: !guardOff && guardInit,
      detail: guardOff
        ? "ORGOS_FS_GUARD=off is forbidden in production"
        : guardInit
          ? "FS-guard initialized"
          : "FS-guard not initialized — run: orgos guard init",
    });
  }

  return checks;
}

export function formatProdAuthWarnings(checks: ProdAuthCheck[]): string[] {
  return checks.filter((c) => c.warn || !c.ok).map((c) => `${c.id}: ${c.detail}`);
}

export function assertProdAuthReady(scope: "chat" | "wire" | "all" = "all"): void {
  const prod = isProdMode();
  if (!prod) return;
  const failed = runProdAuthChecks(scope).filter((c) => !c.ok);
  if (failed.length) {
    throw new Error(
      `Production auth check failed:\n${failed.map((c) => `- ${c.detail}`).join("\n")}`
    );
  }
}
