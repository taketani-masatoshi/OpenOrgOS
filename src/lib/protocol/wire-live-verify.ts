import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";
import { setTenantId } from "../tenant.js";
import { runProdWireGate, evaluateEmailWireReadiness, isEmailWireProductionRequired } from "./prod-wire-gate.js";
import { evaluateWireImplementationChecklist } from "./wire-implementation-score.js";
import { redactEnvRecord, redactSecrets } from "./redact-secrets.js";
import { listTransactions } from "./transactions.js";
import { loadWitnessPoolConfig, isWitnessEnabled } from "./witness-pool.js";
import { fetchReceiptsFromPool, verifyCachedReceiptsForEvent } from "./witness-client.js";

export interface WireLiveVerifyStep {
  id: string;
  ok: boolean;
  detail: string;
}

export interface WireLiveVerifyResult {
  tenant: string;
  ok: boolean;
  gated: boolean;
  public_base_url: string;
  steps: WireLiveVerifyStep[];
  scores: {
    wire_checklist: number;
    wire_checklist_grade: string;
  };
  redacted_env: Record<string, string | undefined>;
  evidence_path?: string;
}

function ensurePilotMailConfig(tenantId: string): void {
  const recordsDir = join(ROOT_DIR, "tenants", tenantId, "records", "executive");
  const configPath = join(recordsDir, "mail-config.yaml");
  const examplePath = join(recordsDir, "mail-config.mal-pilot.yaml.example");
  if (existsSync(configPath) || !existsSync(examplePath)) return;
  mkdirSync(recordsDir, { recursive: true });
  copyFileSync(examplePath, configPath);
}

function httpHealth(url: string): { ok: boolean; status: number; body?: string } {
  try {
    const res = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", url], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    const status = Number(res.stdout?.trim() || 0);
    return { ok: status === 200, status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function isWireLiveVerifyEnabled(): boolean {
  return process.env.ORGOS_LIVE_VERIFY === "1";
}

export async function runWireLiveVerify(opts: {
  tenant: string;
  publicBaseUrl?: string;
  writeEvidence?: boolean;
  roundtrip?: boolean;
}): Promise<WireLiveVerifyResult> {
  const tenant = opts.tenant;
  setTenantId(tenant);
  const publicBaseUrl =
    opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "https://wire.oorgos.org";
  const steps: WireLiveVerifyStep[] = [];
  const gated = isWireLiveVerifyEnabled();

  const prevExternalTls = process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
  const prevGovTransport = process.env.GOV_GATEWAY_TRANSPORT;
  const prevStrictTrust = process.env.ORGOS_STRICT_TRUST;
  const prevStrictJurisdictions = process.env.ORGOS_STRICT_TRUST_JURISDICTIONS;
  const prevRequirePk = process.env.ORGOS_REQUIRE_PK_DID;
  process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY =
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY ?? "1";
  process.env.ORGOS_STRICT_TRUST_JURISDICTIONS =
    process.env.ORGOS_STRICT_TRUST_JURISDICTIONS ?? "JP";
  process.env.GOV_GATEWAY_TRANSPORT = process.env.GOV_GATEWAY_TRANSPORT ?? "live";
  process.env.ORGOS_STRICT_TRUST = process.env.ORGOS_STRICT_TRUST ?? "1";
  process.env.ORGOS_REQUIRE_PK_DID = process.env.ORGOS_REQUIRE_PK_DID ?? "1";

  ensurePilotMailConfig(tenant);

  if (!gated) {
    return {
      tenant,
      ok: false,
      gated: false,
      public_base_url: publicBaseUrl,
      steps: [
        {
          id: "env_gate",
          ok: false,
          detail: "Set ORGOS_LIVE_VERIFY=1 to run live verification (no external side effects in check mode)",
        },
      ],
      scores: { wire_checklist: 0, wire_checklist_grade: "pilot" },
      redacted_env: redactEnvRecord({
        ORGOS_LIVE_VERIFY: process.env.ORGOS_LIVE_VERIFY,
        ORGOS_TENANT: tenant,
        PUBLIC_BASE_URL: publicBaseUrl,
      }),
    };
  }

  const healthUrl = `${publicBaseUrl.replace(/\/$/, "")}/wire/v1/health`;
  const health = httpHealth(healthUrl);
  steps.push({
    id: "wire_health",
    ok: health.ok,
    detail: health.ok ? `${healthUrl} HTTP ${health.status}` : `${healthUrl} HTTP ${health.status || "failed"}`,
  });

  const gate = runProdWireGate({
    tenantId: tenant,
    strictTrust: true,
    strictTls: true,
    strictTransport: true,
    govLive: true,
    publicBaseUrl,
  });
  steps.push({
    id: "wire_prod_gate",
    ok: gate.ok,
    detail: gate.ok
      ? "doctor --wire-prod equivalent passed"
      : gate.checks
          .filter((c) => !c.ok)
          .map((c) => `${c.id}: ${(c.issues ?? []).join("; ")}`)
          .join(" · ") || "wire prod gate failed",
  });

  const emailReady = evaluateEmailWireReadiness(tenant);
  const emailRequired = isEmailWireProductionRequired();
  steps.push({
    id: "email_wire_readiness",
    ok: emailRequired ? emailReady.ok : true,
    detail: emailRequired
      ? emailReady.detail
      : emailReady.ok
        ? emailReady.detail
        : `deferred — ${(emailReady.issues ?? []).join("; ") || emailReady.detail}`,
  });

  if (isWitnessEnabled(loadWitnessPoolConfig())) {
    const pool = loadWitnessPoolConfig();
    const missing: string[] = [];
    for (const tx of listTransactions()) {
      if (tx.direction !== "outbound") continue;
      await fetchReceiptsFromPool(tx.event_id, pool);
      const { receipts } = verifyCachedReceiptsForEvent(tx.event_id, pool);
      if (receipts.length === 0) missing.push(tx.event_id);
    }
    steps.push({
      id: "witness_receipt_cache",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? "all outbound transactions have cached witness receipts"
          : `missing receipts for ${missing.length} event(s)`,
    });
  } else {
    steps.push({
      id: "witness_receipt_cache",
      ok: true,
      detail: "witness pool inactive — skipped",
    });
  }

  const checklist = evaluateWireImplementationChecklist();
  steps.push({
    id: "wire_checklist",
    ok: checklist.total >= 80,
    detail: `${checklist.total}/${checklist.max} (${checklist.grade})`,
  });

  if (opts.roundtrip) {
    const script = join(ROOT_DIR, "scripts", "phase4-mal-email-wire-live.sh");
    const live = spawnSync(script, [tenant, "live"], {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      env: {
        ...process.env,
        ORGOS_TENANT: tenant,
        PUBLIC_BASE_URL: publicBaseUrl,
        ORGOS_EMAIL_WIRE_REQUIRED: process.env.ORGOS_EMAIL_WIRE_REQUIRED ?? "1",
      },
      timeout: 180_000,
    });
    const output = redactSecrets(`${live.stdout ?? ""}${live.stderr ?? ""}`).trim();
    steps.push({
      id: "email_wire_roundtrip",
      ok: live.status === 0,
      detail: live.status === 0 ? "Phase 4 live roundtrip OK" : output.slice(-500) || "roundtrip failed",
    });
  }

  const result: WireLiveVerifyResult = {
    tenant,
    ok: steps.every((s) => s.ok),
    gated: true,
    public_base_url: publicBaseUrl,
    steps,
    scores: {
      wire_checklist: checklist.total,
      wire_checklist_grade: checklist.grade,
    },
    redacted_env: redactEnvRecord({
      ORGOS_LIVE_VERIFY: process.env.ORGOS_LIVE_VERIFY,
      ORGOS_LIVE_VERIFY_ROUNDTRIP: opts.roundtrip ? "1" : process.env.ORGOS_LIVE_VERIFY_ROUNDTRIP,
      ORGOS_TENANT: tenant,
      PUBLIC_BASE_URL: publicBaseUrl,
      ORGOS_SMTP_USER: process.env.ORGOS_SMTP_USER,
      ORGOS_IMAP_USER: process.env.ORGOS_IMAP_USER,
    }),
  };

  if (opts.writeEvidence !== false) {
    const dir = join(ROOT_DIR, "scratch");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const evidencePath = join(dir, `wire-live-verify-${tenant}-${stamp}.json`);
    writeFileSync(evidencePath, JSON.stringify(result, null, 2), "utf-8");
    result.evidence_path = evidencePath;
  }

  if (prevExternalTls === undefined) delete process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
  else process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = prevExternalTls;
  if (prevGovTransport === undefined) delete process.env.GOV_GATEWAY_TRANSPORT;
  else process.env.GOV_GATEWAY_TRANSPORT = prevGovTransport;
  if (prevStrictTrust === undefined) delete process.env.ORGOS_STRICT_TRUST;
  else process.env.ORGOS_STRICT_TRUST = prevStrictTrust;
  if (prevStrictJurisdictions === undefined) delete process.env.ORGOS_STRICT_TRUST_JURISDICTIONS;
  else process.env.ORGOS_STRICT_TRUST_JURISDICTIONS = prevStrictJurisdictions;
  if (prevRequirePk === undefined) delete process.env.ORGOS_REQUIRE_PK_DID;
  else process.env.ORGOS_REQUIRE_PK_DID = prevRequirePk;

  return result;
}

export function formatWireLiveVerifyReport(result: WireLiveVerifyResult): string {
  const lines = [
    `Wire live verify — ${result.tenant} · ${result.ok ? "PASS" : "FAIL"}`,
    `  gated: ${result.gated ? "yes (ORGOS_LIVE_VERIFY=1)" : "no"}`,
    `  public: ${result.public_base_url}`,
    `  checklist: ${result.scores.wire_checklist}/100 (${result.scores.wire_checklist_grade})`,
  ];
  for (const step of result.steps) {
    lines.push(`  ${step.ok ? "✓" : "✗"} ${step.id}: ${step.detail}`);
  }
  if (result.evidence_path) lines.push(`  evidence: ${result.evidence_path}`);
  return lines.join("\n");
}
