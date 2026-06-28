#!/usr/bin/env node
/**
 * E2E / combined Operator Console server — seeds demo wire+witness, starts Steward Chat BFF.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
  STEWARD_CHAT_SPA_DIST,
} from "../src/lib/steward-chat/server.js";
import {
  startDemoWitnessHubs,
  type DemoWitnessHubs,
} from "../tests/helpers/demo-witness-fixture.js";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";

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

  if (process.env.STEWARD_CHAT_E2E_SEED !== "0") {
    await seedDemo();
    setTenantId(process.env.ORGOS_TENANT ?? "demo");
    pushQueueEvent({
      type: "pipeline_daily_complete",
      ref: "daily",
      status: "done",
      payload: { summary: "E2E demo pipeline complete" },
    });
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
  let server: StewardChatServerHandle | undefined;

  const shutdown = (): void => {
    witnessHubs?.close();
    witnessHubs = undefined;
    server?.close();
    server = undefined;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  server = startStewardChatServer({ host: "127.0.0.1", port });
  process.env.STEWARD_CHAT_SMOKE_URL = server.url;
  console.log(`steward-chat e2e server ${server.url} (tenant=${process.env.ORGOS_TENANT})`);

  await new Promise<void>(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
