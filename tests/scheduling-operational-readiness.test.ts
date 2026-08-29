import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { ensureExecutiveMailConfig } from "../src/lib/correspondence/ensure-mail-config.js";
import {
  collectOperationalReadinessIssues,
  syncOperatorKeyHashesFromLocalFiles,
} from "../src/lib/scheduling-coordination/operational-readiness.js";
import {
  clearOperatorsRegistryCacheForTests,
  hashOperatorKey,
  loadOperatorRegistry,
  saveOperatorRegistry,
  verifyOperatorKey,
} from "../src/lib/org/operators.js";
import { readOperatorKeyFromFile } from "../src/lib/console-auth/cli-operator.js";
import { approveAndSendSchedulingProposals } from "../src/lib/scheduling-coordination/approve-send-proposals.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/lifecycle.js";
import { upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  seedSchedulingContacts,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { ensureOperatorAuthEnv } from "../src/lib/org/operator-keys.js";
import { setCliOperatorContext } from "../src/lib/console-auth/cli-operator.js";
import { authenticateOperator } from "../src/lib/console-auth/operator-rbac.js";

describe("scheduling operational readiness", () => {
  const tenantId = "test-scheduling-readiness";
  const keyPath = join(homedir(), ".orgos", "operators", "OP-001.key");
  let keyBackup: string | undefined;

  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedSchedulingContacts();
    const mail = getMailConfigPath();
    if (existsSync(mail)) rmSync(mail);
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Test",
        public_disclosure: { representative_email: "rep@test.co.jp" },
      }),
      "utf-8"
    );
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    for (const file of [
      ["scheduling-cases.yaml", "version: 1\ncases: []\n"],
      ["calendar.yaml", "events: []\n"],
      ["ceo-inline-questions.yaml", "version: 1\nquestions: []\n"],
    ] as const) {
      writeFileSync(join(getDataDir(), "executive", file[0]), file[1], "utf-8");
    }
    writeFileSync(join(getDataDir(), "org", "pending-approvals.yaml"), "version: \"1\"\napprovals: []\n", "utf-8");
    if (existsSync(keyPath)) keyBackup = readFileSync(keyPath, "utf-8");
    clearOperatorsRegistryCacheForTests();
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          approver_name: "CEO",
          key_hash: hashOperatorKey("readiness-op-001"),
        },
      ],
    });
    writeFileSync(keyPath, "readiness-op-001\n", { mode: 0o600 });
  });

  afterEach(() => {
    cleanupSchedulingTenant(tenantId);
    clearOperatorsRegistryCacheForTests();
    const mail = getMailConfigPath();
    if (existsSync(mail)) rmSync(mail);
    if (keyBackup !== undefined) writeFileSync(keyPath, keyBackup, { mode: 0o600 });
    delete process.env.STEWARD_OPERATOR_AUTH;
    delete process.env.ORGOS_OPERATOR_KEY;
    vi.restoreAllMocks();
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

  it("syncOperatorKeyHashesFromLocalFiles leaves verify passing", () => {
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          approver_name: "CEO",
          key_hash: hashOperatorKey("stale-readiness-key"),
        },
      ],
    });
    const key = readOperatorKeyFromFile("OP-001")!;

    const synced = syncOperatorKeyHashesFromLocalFiles();
    expect(synced).toContain("OP-001");

    const op = loadOperatorRegistry()!.operators[0]!;
    expect(verifyOperatorKey(op.key_hash, key)).toBe(true);
    expect(collectOperationalReadinessIssues().issues.some((i) => i.id.startsWith("operator_key_mismatch"))).toBe(
      false
    );
  });

  it("repairCorrespondenceApprovalRegistry enables approve-send batch", async () => {
    ensureExecutiveMailConfig({ dryRunSmtp: true });
    process.env.STEWARD_OPERATOR_AUTH = "1";
    ensureOperatorAuthEnv("OP-001");
    const auth = authenticateOperator({ operatorId: "OP-001", key: process.env.ORGOS_OPERATOR_KEY });
    if ("error" in auth) throw new Error(auth.error);
    setCliOperatorContext(auth);

    const row = upsertSchedulingCase(schedulingCase("SCH-2026-901", 2));
    const withDrafts = ensureSchedulingCorrespondenceDrafts(row.id, "proposal");
    rmSync(join(getDataDir(), "org", "pending-approvals.yaml"), { force: true });

    const repaired = collectOperationalReadinessIssues({ repairApprovals: true });
    expect(repaired.repaired_approvals.length).toBeGreaterThan(0);

    const sent = await approveAndSendSchedulingProposals({
      caseId: withDrafts.id,
      operatorId: "OP-001",
      dryRun: true,
      reviewed: true,
      command: "test",
    });
    expect(sent.length).toBe(2);
    expect(
      withDrafts.correspondence.filter((r) => r.kind === "proposal").every((r) =>
        sent.includes(r.draft_id)
      )
    ).toBe(true);
  });
});
