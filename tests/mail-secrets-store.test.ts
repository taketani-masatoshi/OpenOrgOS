import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, statSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildMailSecretsSnapshot,
  mailSecretsFilePath,
  resetMailSecretsHydrationForTest,
  saveMailSecrets,
} from "../src/lib/correspondence/mail-secrets-store.js";

describe("mail secrets store", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    for (const key of [
      "ORGOS_SMTP_USER",
      "ORGOS_SMTP_PASSWORD",
      "ORGOS_IMAP_USER",
      "ORGOS_IMAP_PASSWORD",
    ]) {
      delete process.env[key];
    }
    rmSync(mailSecretsFilePath(), { force: true });
    resetMailSecretsHydrationForTest();
  });

  afterEach(() => {
    rmSync(mailSecretsFilePath(), { force: true });
    resetMailSecretsHydrationForTest();
    process.env = { ...env };
  });

  it("writes a 0600 file and reports masked hints only", () => {
    saveMailSecrets({
      ORGOS_SMTP_USER: "ops@example.com",
      ORGOS_SMTP_PASSWORD: "super-secret-password",
    });

    expect(statSync(mailSecretsFilePath()).mode & 0o777).toBe(0o600);

    const snapshot = buildMailSecretsSnapshot();
    expect(snapshot.smtp_password_configured).toBe(true);
    expect(snapshot.imap_password_configured).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("super-secret-password");
    expect(snapshot.smtp_user_hint).not.toBe("ops@example.com");
  });

  it("keeps deploy env values ahead of the store", () => {
    saveMailSecrets({ ORGOS_SMTP_USER: "stored@example.com" });
    resetMailSecretsHydrationForTest();
    process.env.ORGOS_SMTP_USER = "deploy@example.com";

    buildMailSecretsSnapshot();
    expect(process.env.ORGOS_SMTP_USER).toBe("deploy@example.com");
  });
});
