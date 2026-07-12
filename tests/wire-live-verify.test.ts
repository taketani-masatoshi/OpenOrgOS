import { describe, it, expect } from "vitest";
import { redactEnvRecord, redactSecrets } from "../src/lib/protocol/redact-secrets.js";
import {
  isWireLiveVerifyEnabled,
  runWireLiveVerify,
} from "../src/lib/protocol/wire-live-verify.js";
import { resolveWireOutboundConfig } from "../src/lib/correspondence/mail-config.js";
import { setTenantId } from "../src/lib/tenant.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir } from "../src/lib/tenant.js";

describe("redact-secrets", () => {
  it("redacts password-like env values", () => {
    const out = redactEnvRecord({
      ORGOS_SMTP_USER: "ai@example.com",
      ORGOS_SMTP_PASSWORD: "secret123",
      PUBLIC_BASE_URL: "https://wire.example",
    });
    expect(out.ORGOS_SMTP_USER).toBe("ai@example.com");
    expect(out.ORGOS_SMTP_PASSWORD).toBe("***");
  });

  it("redacts inline secrets in log text", () => {
    const text = "ORGOS_SMTP_PASSWORD=hunter2 and Bearer abc.def.ghi";
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain("hunter2");
    expect(redacted).toMatch(/ORGOS_SMTP_PASSWORD=\*\*\*/i);
  });
});

describe("wire-live-verify gate", () => {
  it("refuses without ORGOS_LIVE_VERIFY=1", async () => {
    const prev = process.env.ORGOS_LIVE_VERIFY;
    delete process.env.ORGOS_LIVE_VERIFY;
    expect(isWireLiveVerifyEnabled()).toBe(false);
    const result = await runWireLiveVerify({
      tenant: "demo",
      writeEvidence: false,
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.id).toBe("env_gate");
    if (prev === undefined) delete process.env.ORGOS_LIVE_VERIFY;
    else process.env.ORGOS_LIVE_VERIFY = prev;
  });
});

describe("resolveWireOutboundConfig dry_run", () => {
  const tenant = `dry-run-mail-${process.pid}`;
  const tenantDir = join(getTenantsDir(), tenant);

  it("forces dry_run when mail-config provider is dry_run even if SMTP env is set", () => {
    rmSync(tenantDir, { recursive: true, force: true });
    mkdirSync(join(tenantDir, "records", "executive"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: dry run mail test\nlifecycle: test\njurisdiction: JP\n`,
      "utf-8"
    );
    writeFileSync(
      join(tenantDir, "records", "executive", "mail-config.yaml"),
      `provider: dry_run
from:
  name: Test
  email: wire@test.local
wire_outbound:
  enabled: true
  from:
    name: Wire
    email: wire@test.local
  smtp:
    host: smtp.test.local
    port: 587
    secure: false
`,
      "utf-8"
    );
    setTenantId(tenant);
    const prevUser = process.env.ORGOS_SMTP_USER;
    const prevPass = process.env.ORGOS_SMTP_PASSWORD;
    process.env.ORGOS_SMTP_USER = "live@example.com";
    process.env.ORGOS_SMTP_PASSWORD = "secret";
    try {
      expect(resolveWireOutboundConfig().provider).toBe("dry_run");
    } finally {
      if (prevUser === undefined) delete process.env.ORGOS_SMTP_USER;
      else process.env.ORGOS_SMTP_USER = prevUser;
      if (prevPass === undefined) delete process.env.ORGOS_SMTP_PASSWORD;
      else process.env.ORGOS_SMTP_PASSWORD = prevPass;
      rmSync(tenantDir, { recursive: true, force: true });
      setTenantId("demo");
    }
  });
});
