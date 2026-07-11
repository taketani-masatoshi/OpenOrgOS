import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { ensureExecutiveMailConfig } from "../src/lib/correspondence/ensure-mail-config.js";
import { collectOperationalReadinessIssues } from "../src/lib/scheduling-coordination/operational-readiness.js";

describe("scheduling operational readiness", () => {
  beforeEach(() => {
    setTenantId("demo");
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Test",
        public_disclosure: { representative_email: "rep@test.co.jp" },
      }),
      "utf-8"
    );
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    for (const file of [
      ["scheduling-cases.yaml", "version: 1\ncases: []\n"],
      ["calendar.yaml", "events: []\n"],
      ["ceo-inline-questions.yaml", "version: 1\nquestions: []\n"],
    ] as const) {
      writeFileSync(join(getDataDir(), "executive", file[0]), file[1], "utf-8");
    }
  });

  afterEach(() => {
    const mail = getMailConfigPath();
    if (existsSync(mail)) rmSync(mail);
  });

  it("creates mail-config via ensureExecutiveMailConfig", () => {
    const result = ensureExecutiveMailConfig({ dryRunSmtp: true });
    expect(result.created).toBe(true);
    expect(existsSync(getMailConfigPath())).toBe(true);
  });

  it("reports mail-config missing until repair flag creates it", () => {
    const before = collectOperationalReadinessIssues();
    expect(before.issues.some((i) => i.id === "mail_config_file")).toBe(true);

    const after = collectOperationalReadinessIssues({ ensureMailConfig: true, syncOperatorKeys: false });
    expect(after.issues.some((i) => i.id === "mail_config_file")).toBe(false);
  });
});
