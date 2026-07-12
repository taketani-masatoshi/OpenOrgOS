import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import { resolveWireOutboundConfig } from "../src/lib/correspondence/mail-config.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";

const MAIL_ENV_KEYS = [
  "ORGOS_SMTP_HOST",
  "ORGOS_SMTP_PORT",
  "ORGOS_SMTP_SECURE",
  "ORGOS_SMTP_USER",
  "ORGOS_SMTP_PASSWORD",
  "ORGOS_WIRE_SMTP_HOST",
  "ORGOS_WIRE_SMTP_PORT",
  "ORGOS_WIRE_SMTP_SECURE",
  "ORGOS_WIRE_SMTP_USER",
  "ORGOS_WIRE_SMTP_PASSWORD",
] as const;

describe("resolveWireOutboundConfig dry_run priority", () => {
  const saved: Partial<Record<(typeof MAIL_ENV_KEYS)[number], string | undefined>> = {};
  const tenant = "demo";
  let mailConfigBackup: string | null = null;

  beforeEach(() => {
    setTenantId(tenant);
    for (const key of MAIL_ENV_KEYS) {
      saved[key] = process.env[key];
    }
    const path = getMailConfigPath();
    if (existsSync(path)) {
      mailConfigBackup = `${path}.vitest-backup`;
      writeFileSync(mailConfigBackup, readFileSync(path, "utf-8"), "utf-8");
    } else {
      mailConfigBackup = null;
    }
    mkdirSync(join(ROOT_DIR, "tenants", tenant, "records", "executive"), {
      recursive: true,
    });
  });

  afterEach(() => {
    const path = getMailConfigPath();
    if (mailConfigBackup && existsSync(mailConfigBackup)) {
      writeFileSync(path, readFileSync(mailConfigBackup, "utf-8"), "utf-8");
      rmSync(mailConfigBackup);
      mailConfigBackup = null;
    } else if (existsSync(path)) {
      rmSync(path);
    }
    for (const key of MAIL_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("keeps dry_run even when ORGOS_SMTP_* credentials are present", () => {
    process.env.ORGOS_SMTP_HOST = "sv16463.xserver.jp";
    process.env.ORGOS_SMTP_USER = "ai@example.com";
    process.env.ORGOS_SMTP_PASSWORD = "not-a-real-secret";
    writeFileSync(
      getMailConfigPath(),
      `provider: dry_run
from:
  name: Test
  email: secretary@roundtrip.test
wire_outbound:
  enabled: true
  from:
    name: Wire
    email: wire@roundtrip.test
`,
      "utf-8"
    );

    const cfg = resolveWireOutboundConfig();
    expect(cfg.provider).toBe("dry_run");
    expect(cfg.enabled).toBe(true);
  });

  it("keeps dry_run when wire smtp host is smtp.test.local", () => {
    process.env.ORGOS_SMTP_HOST = "smtp.live.example";
    process.env.ORGOS_SMTP_USER = "user@example.com";
    process.env.ORGOS_SMTP_PASSWORD = "not-a-real-secret";
    writeFileSync(
      getMailConfigPath(),
      `provider: smtp
from:
  name: Test
  email: secretary@roundtrip.test
wire_outbound:
  enabled: true
  from:
    name: Wire
    email: wire@roundtrip.test
  smtp:
    host: smtp.test.local
    port: 587
`,
      "utf-8"
    );

    expect(resolveWireOutboundConfig().provider).toBe("dry_run");
  });
});
