#!/usr/bin/env node
/**
 * E2E Operator Console server — seeds demo wire+witness, then serves the same combined
 * surface as production (`/chat/v1` + `/console/v1` + SPA) so `/wire/` works in E2E.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { STEWARD_CHAT_SPA_DIST } from "../src/lib/steward-chat/server.js";
import {
  startOperatorConsoleServer,
  type OperatorConsoleServerHandle,
} from "../src/lib/operator-console/combined-server.js";
import {
  startDemoWitnessHubs,
  type DemoWitnessHubs,
} from "../tests/helpers/demo-witness-fixture.js";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";
import { writeFileSync } from "node:fs";
import { ROOT_DIR } from "../src/lib/tenant.js";

/**
 * `bank-accounts.yaml` is L2 and therefore gitignored, so a fresh checkout has
 * none and every money surface answers "file missing". The committed example is
 * a template full of REPLACE_ME, so seed an explicit demo account instead: the
 * digits are fake and what is under test is that they come back masked.
 */
const DEMO_BANK_ACCOUNTS = [
  "entity: Demo Corp",
  'as_of: "2026-08-01"',
  "status: active",
  "accounts:",
  "  - id: BANK-001",
  "    bank: デモ銀行",
  '    bank_code: "0009"',
  "    branch: デモ支店",
  '    branch_code: "001"',
  "    account_type: 普通",
  '    account_number: "1234567"',
  "    holder: Demo Corp",
  "    purpose: デモ用",
  "    ib_enabled: true",
  "    notes: null",
  "",
].join("\n");

function ensureDemoBankAccounts(): void {
  const target = join(ROOT_DIR, "tenants/demo/data/finance/bank-accounts.yaml");
  if (existsSync(target)) return;
  writeFileSync(target, DEMO_BANK_ACCOUNTS, "utf-8");
  console.log(`seeded demo bank accounts at ${target}`);
}

async function seedDemo(): Promise<void> {
  const r = spawnSync("node", ["--import", "tsx", "scripts/seed-demo-wire-skeleton.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ORGOS_TENANT: "demo" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function main(): Promise<void> {
  if (!existsSync(join(STEWARD_CHAT_SPA_DIST, "index.html"))) {
    console.error("Steward Chat SPA not built. Run: npm run steward-chat:build");
    process.exit(1);
  }

  process.env.ORGOS_TENANT = process.env.ORGOS_TENANT ?? "demo";
  process.env.STEWARD_CHAT_AUTH = process.env.STEWARD_CHAT_AUTH ?? "1";
  process.env.WIRE_CONSOLE_DEV_PASSKEY = process.env.WIRE_CONSOLE_DEV_PASSKEY ?? "orgos-dev";
  process.env.ORGOS_LLM_MOCK = process.env.ORGOS_LLM_MOCK ?? "1";
  process.env.ORGOS_LLM_STRUCTURED = process.env.ORGOS_LLM_STRUCTURED ?? "1";
  process.env.ORGOS_LLM_TELEMETRY = process.env.ORGOS_LLM_TELEMETRY ?? "1";
  process.env.ORGOS_MCP_AUTH = process.env.ORGOS_MCP_AUTH ?? "0";
  process.env.ORGOS_SESSION_PERSIST = process.env.ORGOS_SESSION_PERSIST ?? "0";
  process.env.ORGOS_CSRF = process.env.ORGOS_CSRF ?? "0";
  process.env.ORGOS_RATE_LIMIT = process.env.ORGOS_RATE_LIMIT ?? "0";
  // With a webhook secret present the endpoint enforces signatures, so the E2E
  // suite exercises the refusal that production depends on instead of the
  // permissive stub path.
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_smoke";
  // The E2E operator is the platform operator here, so platform surfaces are
  // exercised for real instead of only ever answering 403.
  process.env.ORGOS_PLATFORM_OPERATORS = process.env.ORGOS_PLATFORM_OPERATORS ?? "OP-001";

  if (process.env.STEWARD_CHAT_E2E_SEED !== "0") {
    await seedDemo();
    setTenantId(process.env.ORGOS_TENANT ?? "demo");
    ensureLedgerDemoChartOfAccounts();
    ensureDemoBankAccounts();
    pushQueueEvent({
      type: "pipeline_daily_complete",
      ref: "daily",
      status: "done",
      payload: { summary: "E2E demo pipeline complete" },
    });
  } else {
    setTenantId(process.env.ORGOS_TENANT ?? "demo");
    ensureLedgerDemoChartOfAccounts();
    ensureDemoBankAccounts();
  }

  let witnessHubs: DemoWitnessHubs | undefined;
  if (process.env.STEWARD_CHAT_WITNESS_HUBS !== "0") {
    try {
      witnessHubs = await startDemoWitnessHubs();
      console.log("demo witness hubs started (19490, 19491)");
    } catch (e) {
      console.warn(
        "⚠ demo witness hubs failed — witness E2E register may fail:",
        e instanceof Error ? e.message : e
      );
    }
  }

  const port = Number(process.env.STEWARD_CHAT_SMOKE_PORT ?? "9473");
  let server: OperatorConsoleServerHandle | undefined;

  const shutdown = (): void => {
    witnessHubs?.close();
    witnessHubs = undefined;
    server?.close();
    server = undefined;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  server = await startOperatorConsoleServer({ host: "127.0.0.1", port });
  process.env.STEWARD_CHAT_SMOKE_URL = server.url;
  console.log(`steward-chat e2e server ${server.url} (tenant=${process.env.ORGOS_TENANT})`);

  await new Promise<void>(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
