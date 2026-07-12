import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupSchedulingTenant,
  seedDryRunMailConfig,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { runSchedulingRehearsalCore } from "../src/lib/scheduling-coordination/rehearsal.js";
import { findSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { rotateOperatorKeyRecord, ensureOperatorAuthEnv } from "../src/lib/org/operator-keys.js";
import { saveOperatorRegistry, clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { getDataDir } from "../src/lib/utils.js";

const tenantId = "test-scheduling-rehearsal-cli";

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

describe("scheduling rehearsal CLI core", () => {
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

  it("runs full rehearsal end-to-end on isolated tenant", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-rehearsal-cli",
          hangoutLink: "https://meet.google.com/rehearsal-cli",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    ensureOperatorAuthEnv("OP-001");
    const result = await runSchedulingRehearsalCore({
      full: true,
      skipValidate: true,
      title: "CLI rehearsal",
      participants: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.case_id).toMatch(/^SCH-\d{4}-\d{3}$/);
    expect(result.steps).toEqual(
      expect.arrayContaining([
        "doctor-repair",
        "operator-auth",
        expect.stringMatching(/^new:SCH-/),
        expect.stringMatching(/^propose:/),
        expect.stringMatching(/^approve-send:/),
        "advance:ceo_confirm",
        expect.stringMatching(/^ceo-answer:/),
        "assertions:ok",
      ])
    );
    expect(result.processed_mail_ids).toHaveLength(2);
    expect(result.assertions?.ok).toBe(true);
    expect(findSchedulingCase(result.case_id!)?.status).toBe("closed");
  }, 60_000);
});
