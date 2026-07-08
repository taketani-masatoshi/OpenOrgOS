import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";
import { configureHubRuntime } from "../../src/lib/hub/runtime.js";
import { startHubServer } from "../../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../../src/lib/hub/signing.js";
import { getWitnessPoolYamlPath } from "../../src/lib/protocol/paths.js";
import { ROOT_DIR, setTenantId } from "../../src/lib/tenant.js";
import { writeYamlFile } from "../../src/lib/utils.js";
import { WIRE_CONSOLE_TEST_TENANT } from "./wire-console-test-fixture.js";

const HUB_A_DIR = join(ROOT_DIR, "scratch", "wire-console-smoke-hub-a");
const HUB_B_DIR = join(ROOT_DIR, "scratch", "wire-console-smoke-hub-b");

export interface WireConsoleWitnessHubs {
  close: () => void;
}

/** Local witness hubs for wire-console Playwright / smoke (isolated ports). */
export async function startWireConsoleWitnessHubs(): Promise<WireConsoleWitnessHubs> {
  for (const dir of [HUB_A_DIR, HUB_B_DIR]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  setTenantId(WIRE_CONSOLE_TEST_TENANT);

  configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
  const hubAKey = exportHubPublicKeyBase64();
  configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
  const hubBKey = exportHubPublicKeyBase64();

  const hubA = await startHubServer({
    hubId: "HUB-A",
    dataDir: HUB_A_DIR,
    host: "127.0.0.1",
    port: 19482,
  });
  const hubB = await startHubServer({
    hubId: "HUB-B",
    dataDir: HUB_B_DIR,
    host: "127.0.0.1",
    port: 19483,
  });

  writeYamlFile(
    getWitnessPoolYamlPath(),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      register_on: "both",
      hubs: [
        {
          hub_id: "HUB-A",
          hub_url: "http://127.0.0.1:19482",
          hub_public_key: hubAKey,
          priority: 1,
        },
        {
          hub_id: "HUB-B",
          hub_url: "http://127.0.0.1:19483",
          hub_public_key: hubBKey,
          priority: 2,
        },
      ],
    })
  );

  return {
    close: () => {
      hubA.close();
      hubB.close();
      for (const dir of [HUB_A_DIR, HUB_B_DIR]) {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export function removeWireConsoleWitnessPoolConfig(): void {
  const poolPath = join(
    ROOT_DIR,
    "tenants",
    WIRE_CONSOLE_TEST_TENANT,
    "data/protocol/witness-pool.yaml"
  );
  if (existsSync(poolPath)) rmSync(poolPath, { force: true });
  const receiptsDir = join(
    ROOT_DIR,
    "tenants",
    WIRE_CONSOLE_TEST_TENANT,
    "data/protocol/witness-receipts"
  );
  if (existsSync(receiptsDir)) rmSync(receiptsDir, { recursive: true, force: true });
}
