import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import { sendCorrespondenceEmail } from "../src/lib/correspondence/mail-send.js";
import { syncSchedulingCaseCalendar } from "../src/lib/scheduling-coordination/calendar-write.js";
import {
  findSchedulingCase,
  SchedulingRevisionConflictError,
  updateSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { operatorHasPermission } from "../src/lib/console-auth/operator-rbac.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";
import {
  getExecutiveRecordsDir,
  getMailConfigPath,
} from "../src/lib/correspondence/paths.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-failure";

describe("scheduling failure injection", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    process.env.GOOGLE_CALENDAR_ID = "primary";
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    delete process.env.GMAIL_ACCESS_TOKEN;
    cleanupSchedulingTenant(tenantId);
  });

  it("persists Google HTTP failure, retries, and never duplicates local or remote events", async () => {
    const row = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-705", 1),
      participants: [
        {
          ...schedulingCase("SCH-2026-705", 1).participants[0]!,
          response: "accept",
          accepted_slot_id: "SLOT-001",
        },
      ],
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "google-705",
            hangoutLink: "https://meet.google.com/test-room",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    await expect(syncSchedulingCaseCalendar(row.id, "SLOT-001")).rejects.toThrow("HTTP 503");
    expect(findSchedulingCase(row.id)).toMatchObject({ calendar_sync: "failed" });
    await syncSchedulingCaseCalendar(row.id, "SLOT-001");
    await syncSchedulingCaseCalendar(row.id, "SLOT-001");

    const calendar = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "calendar.yaml"), "utf-8")
    );
    expect(calendar.events).toHaveLength(1);
    expect(calendar.events[0]).toMatchObject({
      google_event_id: "google-705",
      meet_url: "https://meet.google.com/test-room",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not mark a scheduling draft sent when the mocked mail provider fails", async () => {
    const recordsDir = getExecutiveRecordsDir();
    mkdirSync(recordsDir, { recursive: true });
    writeYamlFile(getMailConfigPath(), {
      provider: "gmail_api",
      from: { name: "Secretary", email: "secretary@example.test" },
      receive: { sync: "stub" },
    });
    writeFileSync(
      join(recordsDir, "gmail-oauth.json"),
      JSON.stringify({
        access_token: "mock-token",
        token_type: "Bearer",
        scope: "https://www.googleapis.com/auth/gmail.send",
      })
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider unavailable", { status: 503 })
    );
    const draft = {
      draft_id: "DRAFT-20260711-999-scheduling",
      channel: "email" as const,
      status: "approved" as const,
      created_at: new Date().toISOString(),
      created_by: "secretary",
      to: "alice@example.com",
      subject: "日程候補",
      body: "候補日時です。",
      notes: "scheduling-case:SCH-2026-705",
    };
    await expect(sendCorrespondenceEmail(draft)).rejects.toThrow("send failed: 503");
    expect(draft.status).toBe("approved");
  });

  it("rejects stale revisions and scheduling approval by a readonly operator", () => {
    const inserted = upsertSchedulingCase(schedulingCase("SCH-2026-706", 1));
    updateSchedulingCase(inserted.id, inserted.revision, (current) => ({
      ...current,
      notes: "winner",
    }));
    expect(() =>
      updateSchedulingCase(inserted.id, inserted.revision, (current) => ({
        ...current,
        notes: "stale",
      }))
    ).toThrow(SchedulingRevisionConflictError);
    expect(
      operatorHasPermission(
        {
          operator_id: "readonly-test",
          display_name: "Readonly",
          role: "readonly",
          status: "active",
        },
        "scheduling:approve"
      )
    ).toBe(false);
    expect(schedulingCaseSchema.parse(findSchedulingCase(inserted.id))).toBeTruthy();
  });
});
