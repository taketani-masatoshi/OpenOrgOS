import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { collectMailSetupIssues } from "../src/lib/correspondence/mail-setup-readiness.js";

function seedCompanyEmail(): void {
  const companyPath = join(getDataDir(), "company.yaml");
  writeFileSync(
    companyPath,
    YAML.stringify({
      name: "Test Co",
      public_disclosure: { representative_email: "rep@test.co.jp" },
    }),
    "utf-8"
  );
}

function cleanup(): void {
  const records = getExecutiveRecordsDir();
  if (existsSync(records)) rmSync(records, { recursive: true, force: true });
  delete process.env.ORGOS_SMTP_USER;
  delete process.env.ORGOS_SMTP_PASSWORD;
}

describe("correspondence mail setup readiness", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedCompanyEmail();
  });

  afterEach(() => cleanup());

  it("allows smtp.test.local without SMTP credentials", () => {
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
    writeFileSync(
      getMailConfigPath(),
      YAML.stringify({
        provider: "smtp",
        from: { name: "Test Co", email: "rep@test.co.jp" },
        smtp: { host: "smtp.test.local", port: 587, secure: false },
        receive: { sync: "stub" },
      }),
      "utf-8"
    );

    const issues = collectMailSetupIssues("email");
    expect(issues.some((issue) => issue.id === "smtp_credentials")).toBe(false);
  });

  it("accepts contact_email when representative_email is absent", () => {
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Test Co",
        public_disclosure: { contact_email: "contact@test.co.jp" },
      }),
      "utf-8"
    );
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
    writeFileSync(
      getMailConfigPath(),
      YAML.stringify({
        provider: "smtp",
        from: { name: "Test Co", email: "contact@test.co.jp" },
        smtp: { host: "smtp.test.local", port: 587, secure: false },
        receive: { sync: "stub" },
      }),
      "utf-8"
    );

    const issues = collectMailSetupIssues("email");
    expect(issues.some((issue) => issue.id === "representative_email")).toBe(false);
  });

  it("still requires SMTP credentials for production hosts", () => {
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
    writeFileSync(
      getMailConfigPath(),
      YAML.stringify({
        provider: "smtp",
        from: { name: "Test Co", email: "rep@test.co.jp" },
        smtp: { host: "smtp.example.com", port: 587, secure: false },
        receive: { sync: "stub" },
      }),
      "utf-8"
    );

    const issues = collectMailSetupIssues("email");
    expect(issues.some((issue) => issue.id === "smtp_credentials")).toBe(true);
  });
});
