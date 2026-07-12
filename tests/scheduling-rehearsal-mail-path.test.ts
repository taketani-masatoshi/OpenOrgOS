import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupSchedulingTenant,
  seedDryRunMailConfig,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { runSchedulingRehearsalCore } from "../src/lib/scheduling-coordination/rehearsal.js";
import { injectAndProcessScheduleAcceptReply } from "../src/lib/scheduling-coordination/inject-schedule-reply-mail.js";
import { approveAndSendSchedulingProposals } from "../src/lib/scheduling-coordination/approve-send-proposals.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { schedulingCase } from "./helpers/scheduling-fixture.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/lifecycle.js";
import { rotateOperatorKeyRecord, ensureOperatorAuthEnv } from "../src/lib/org/operator-keys.js";
import { saveOperatorRegistry, clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { setCliOperatorContext } from "../src/lib/console-auth/cli-operator.js";
import { authenticateOperator } from "../src/lib/console-auth/operator-rbac.js";
import { getDataDir } from "../src/lib/utils.js";

const tenantId = "test-scheduling-rehearsal-p2";

function seedOperatorsWithKey(): void {
  saveOperatorRegistry({
    version: "1",
    operators: [
      {
        operator_id: "OP-001",
        display_name: "Test CEO",
        role: "ceo",
        status: "active",
        approver_name: "Test CEO",
        key_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
  });
  rotateOperatorKeyRecord("OP-001");
}

function prepareAuth(): void {
  ensureOperatorAuthEnv("OP-001");
  const auth = authenticateOperator({ operatorId: "OP-001", key: process.env.ORGOS_OPERATOR_KEY });
  if ("error" in auth) throw new Error(auth.error);
  setCliOperatorContext(auth);
}

describe("scheduling rehearsal mail path", () => {
  beforeEach(() => {
    clearOperatorsRegistryCacheForTests();
    seedSchedulingTenant(tenantId);
    seedDryRunMailConfig();
    seedOperatorsWithKey();
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    writeFileSync(join(getDataDir(), "org", "pending-approvals.yaml"), "version: \"1\"\napprovals: []\n");
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
    process.env.GOOGLE_CALENDAR_ID = "primary";
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOperatorsRegistryCacheForTests();
    delete process.env.STEWARD_OPERATOR_AUTH;
    delete process.env.ORGOS_OPERATOR_KEY;
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    cleanupSchedulingTenant(tenantId);
  });

  it("processes accept replies via inject + process-mail", async () => {
    prepareAuth();
    const row = upsertSchedulingCase(schedulingCase("SCH-2026-801", 2));
    const updated = ensureSchedulingCorrespondenceDrafts(row.id, "proposal");
    await approveAndSendSchedulingProposals({
      caseId: updated.id,
      operatorId: "OP-001",
      dryRun: true,
      command: "test",
    });

    const mail = await injectAndProcessScheduleAcceptReply({
      caseId: updated.id,
      participantName: "Alice",
      participantEmail: "alice@example.com",
      mailId: "MSG-P2-ACCEPT-1",
    });
    expect(mail.action).toBe("updated");

    const persisted = findSchedulingCase(updated.id)!;
    expect(persisted.participants[0]).toMatchObject({
      email: "alice@example.com",
      response: "accept",
      responded_mail_id: "MSG-P2-ACCEPT-1",
    });
    expect(persisted.processed_mail_ids).toContain("MSG-P2-ACCEPT-1");
  });

  it("runs full rehearsal with process-mail replies and assertions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-rehearsal-p2",
          hangoutLink: "https://meet.google.com/rehearsal-p2",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const result = await runSchedulingRehearsalCore({
      full: true,
      skipValidate: true,
      title: "Phase2 rehearsal",
      participants: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.steps.some((s) => s.startsWith("process-mail:"))).toBe(true);
    expect(result.processed_mail_ids?.length).toBe(2);
    expect(result.assertions?.ok).toBe(true);
    expect(findSchedulingCase(result.case_id!)?.status).toBe("closed");
  });
});
