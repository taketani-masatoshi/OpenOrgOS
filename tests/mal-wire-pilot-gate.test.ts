import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { runProdWireGate } from "../src/lib/protocol/prod-wire-gate.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { getInstallRoot } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";

describe("mal wire pilot gate", () => {
  const envKeys = [
    "WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY",
    "PUBLIC_BASE_URL",
    "ORGOS_STRICT_TRUST",
    "ORGOS_STRICT_TLS",
    "ORGOS_STRICT_TRANSPORT",
    "ORGOS_STRICT_TRUST_JURISDICTIONS",
    "GOV_GATEWAY_TRANSPORT",
    "ORGOS_EMAIL_WIRE_REQUIRED",
  ] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
  let mailConfigBackup: string | null = null;

  beforeEach(() => {
    setTenantId("mal");
    const peersSeed = join(
      getInstallRoot(),
      "steward/platform/protocol/seed/mal-peers-pilot.yaml.example"
    );
    const peersPath = join(getDataDir(), "protocol", "peers.yaml");
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(peersPath, readFileSync(peersSeed, "utf-8"), "utf-8");
    const mailConfig = getMailConfigPath();
    if (existsSync(mailConfig)) {
      mailConfigBackup = `${mailConfig}.vitest-backup`;
      mkdirSync(dirname(mailConfigBackup), { recursive: true });
      copyFileSync(mailConfig, mailConfigBackup);
      rmSync(mailConfig);
    } else {
      mailConfigBackup = null;
    }
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = "1";
    process.env.PUBLIC_BASE_URL = "https://wire.mal.example";
    process.env.ORGOS_STRICT_TRUST_JURISDICTIONS = "JP";
    process.env.GOV_GATEWAY_TRANSPORT = "mock";
    delete process.env.ORGOS_EMAIL_WIRE_REQUIRED;
  });

  afterEach(() => {
    const mailConfig = getMailConfigPath();
    if (mailConfigBackup) {
      if (existsSync(mailConfig)) rmSync(mailConfig);
      copyFileSync(mailConfigBackup, mailConfig);
      rmSync(mailConfigBackup);
      mailConfigBackup = null;
    }
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("passes wire prod gate with email_wire deferred until ORGOS_EMAIL_WIRE_REQUIRED=1", () => {
    const result = runProdWireGate({
      tenantId: "mal",
      strictTrust: true,
      strictTls: true,
      strictTransport: true,
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(true);
    const email = result.checks.find((check) => check.id === "email_wire");
    expect(email?.ok).toBe(true);
    expect(email?.detail).toMatch(/deferred|ORGOS_EMAIL_WIRE_REQUIRED/i);
  });

  it("reports email_wire blocker when ORGOS_EMAIL_WIRE_REQUIRED=1", () => {
    process.env.ORGOS_EMAIL_WIRE_REQUIRED = "1";
    const result = runProdWireGate({
      tenantId: "mal",
      strictTrust: true,
      strictTls: true,
      strictTransport: true,
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(false);
    const failed = result.checks.filter((check) => !check.ok);
    expect(failed.map((check) => check.id)).toEqual(["email_wire"]);
    expect(failed[0]?.issues).toContain("mail-config.yaml not present");
  });
});
