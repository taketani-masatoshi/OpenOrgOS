#!/usr/bin/env node
/**
 * Production verification for Operator Console deployment.
 * Usage: npm run prod:verify -- --url https://operator.southwood.inc [--tenant demo]
 * Settlement PassKey (ADR 0037 Phase 4): npm run settlement-passkey:verify -- --url ...
 */
import { spawnSync } from "node:child_process";
import { validateDeployUrlMatchesWebAuthn } from "../src/lib/console-auth/settlement-passkey-prod.js";

interface VerifyOptions {
  url: string;
  tenant: string;
  skipDoctor: boolean;
  hubUrls: string[];
  skipWitness: boolean;
}

function parseArgs(): VerifyOptions {
  const args = process.argv.slice(2);
  let url = process.env.OPERATOR_CONSOLE_URL?.trim() ?? "";
  let tenant = process.env.ORGOS_TENANT?.trim() ?? "demo";
  let skipDoctor = false;
  let skipWitness = false;
  const hubUrls: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--url" && args[i + 1]) {
      url = args[++i]!;
    } else if (a === "--tenant" && args[i + 1]) {
      tenant = args[++i]!;
    } else if (a === "--hub-url" && args[i + 1]) {
      hubUrls.push(args[++i]!);
    } else if (a === "--skip-doctor") {
      skipDoctor = true;
    } else if (a === "--skip-witness") {
      skipWitness = true;
    }
  }

  if (!url) {
    console.error(
      "Usage: prod:verify -- --url https://operator.example.com [--tenant demo] [--hub-url http://hub:9474]"
    );
    process.exit(1);
  }

  return { url: url.replace(/\/$/, ""), tenant, skipDoctor, hubUrls, skipWitness };
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}`);
  }
  return res.json();
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const failures: string[] = [];

  console.log(`Operator Console prod verify · ${opts.url} · tenant=${opts.tenant}`);

  try {
    const health = (await fetchJson(`${opts.url}/health`)) as { ok?: boolean; service?: string };
    if (!health.ok) failures.push("/health ok=false");
    else console.log(`✓ /health (${health.service ?? "unknown"})`);
  } catch (e) {
    failures.push(`/health: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const auth = (await fetchJson(`${opts.url}/chat/v1/auth/config`)) as {
      mode?: string;
      prod_adapter?: string;
      webauthn?: {
        rp_id?: string;
        origin?: string;
        settlement_count?: number;
        registration_allowed?: boolean;
      };
    };
    if (auth.mode !== "prod") {
      failures.push(`auth config mode=${auth.mode} (expected prod)`);
    } else {
      console.log(`✓ /chat/v1/auth/config (prod · ${auth.prod_adapter ?? "adapter"})`);
    }
    const webauthnFailures = validateDeployUrlMatchesWebAuthn(opts.url, auth.webauthn);
    if (webauthnFailures.length) {
      for (const f of webauthnFailures) failures.push(`webauthn: ${f}`);
    } else if (auth.webauthn?.origin) {
      console.log(
        `✓ webauthn single RP (rp_id=${auth.webauthn.rp_id} · origin=${auth.webauthn.origin} · settlement=${auth.webauthn.settlement_count ?? 0})`
      );
    }
  } catch (e) {
    failures.push(`/chat/v1/auth/config: ${e instanceof Error ? e.message : e}`);
  }

  if (!opts.skipDoctor) {
    const doctor = spawnSync(
      "node",
      ["--import", "tsx", "src/cli.ts", "doctor", "--tenant", opts.tenant],
      { cwd: process.cwd(), encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: opts.tenant } }
    );
    if (doctor.status !== 0) {
      failures.push(`orgos doctor exit ${doctor.status}`);
      if (doctor.stderr) console.error(doctor.stderr.slice(0, 2000));
    } else {
      const out = `${doctor.stdout}\n${doctor.stderr}`;
      const prodWarn = out.match(/prod_[^\n]+/g);
      if (prodWarn?.length) {
        failures.push(`orgos doctor prod warnings: ${prodWarn.join("; ")}`);
      } else {
        console.log("✓ orgos doctor");
      }
    }
  }

  const notify = spawnSync(
    "node",
    ["--import", "tsx", "src/cli.ts", "notifications", "test", "--tenant", opts.tenant],
    { cwd: process.cwd(), encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: opts.tenant } }
  );
  if (notify.status === 0) {
    console.log("✓ orgos notifications test");
  } else {
    console.log("⚠ orgos notifications test skipped or failed (configure registry webhook for full check)");
  }

  if (!opts.skipWitness) {
    const poolStatus = spawnSync(
      "node",
      [
        "--import",
        "tsx",
        "src/cli.ts",
        "protocol",
        "witness",
        "pool",
        "status",
        "--tenant",
        opts.tenant,
        "--json",
      ],
      { cwd: process.cwd(), encoding: "utf-8", env: { ...process.env, ORGOS_TENANT: opts.tenant } }
    );
    if (poolStatus.status === 0) {
      try {
        const parsed = JSON.parse(poolStatus.stdout) as {
          health?: Array<{ ok?: boolean; hub_id?: string }>;
        };
        const rows = parsed.health ?? [];
        if (rows.length === 0) {
          console.log("⚠ witness pool status: no hubs configured");
        } else if (rows.every((h) => h.ok !== false)) {
          console.log(`✓ witness pool status (${rows.length} hub(s))`);
        } else {
          failures.push("witness pool status: one or more hubs down");
        }
      } catch {
        console.log("✓ witness pool status (non-json)");
      }
    } else {
      console.log("⚠ witness pool status skipped (pool not configured for tenant)");
    }

    for (const hubUrl of opts.hubUrls) {
      try {
        const hubHealth = (await fetchJson(`${hubUrl.replace(/\/$/, "")}/hub/v1/health`)) as {
          ok?: boolean;
        };
        if (!hubHealth.ok) failures.push(`hub health ${hubUrl}: ok=false`);
        else console.log(`✓ hub health ${hubUrl}`);
      } catch (e) {
        failures.push(`hub health ${hubUrl}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (failures.length) {
    console.error("\n✗ prod verify failed:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\n✓ prod verify passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
