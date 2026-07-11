import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { getDataDir } from "../src/lib/utils.js";

const tenantId = "test-scheduling-mail";

function readCases() {
  return YAML.parse(
    readFileSync(join(getDataDir(), "executive", "scheduling-cases.yaml"), "utf-8")
  ) as { cases: ReturnType<typeof schedulingCase>[] };
}

function readTriage() {
  return YAML.parse(
    readFileSync(join(getDataDir(), "executive", "mail-triage-queue.yaml"), "utf-8")
  ) as { entries: Array<{ id: string; schedule_reply_parsed?: boolean }> };
}

describe("scheduling mail body route", () => {
  beforeEach(() => seedSchedulingTenant(tenantId));
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("parses the actual UTF-8 .eml body instead of relying on the subject", async () => {
    const row = upsertSchedulingCase(schedulingCase("SCH-2026-701", 1));
    const entry = schedulingTriage({
      id: "MSG-EML-ACCEPT",
      caseId: row.id,
      from: "Alice <alice@example.com>",
      fixture: "accept-slot-1.eml",
      subject: "Re: 日程について",
    });

    expect((await processScheduleMailEntry(entry)).action).toBe("updated");
    const persisted = readCases().cases.find((item) => item.id === row.id)!;
    expect(persisted.participants[0]).toMatchObject({
      response: "accept",
      accepted_slot_id: "SLOT-001",
      responded_mail_id: entry.id,
    });
    expect(persisted.processed_mail_ids).toEqual([entry.id]);
    expect(readTriage().entries.find((item) => item.id === entry.id)).toMatchObject({
      schedule_reply_parsed: true,
    });
  });

  it("parses a multipart .eml counter body and persists a new revision", async () => {
    const row = upsertSchedulingCase(schedulingCase("SCH-2026-702", 2));
    const entry = schedulingTriage({
      id: "MSG-EML-COUNTER",
      caseId: row.id,
      from: "Carol <carol@example.com>",
      fixture: "counter-slot.eml",
    });
    // Carol is deliberately added as the replying participant.
    upsertSchedulingCase({
      ...row,
      participants: [
        row.participants[0]!,
        { ...row.participants[1]!, name: "Carol", email: "carol@example.com" },
      ],
    });

    await processScheduleMailEntry(entry);
    const persisted = readCases().cases.find((item) => item.id === row.id)!;
    expect(persisted.counter_round).toBe(1);
    expect(persisted.proposal_revision).toBe(1);
    expect(persisted.status).toBe("proposing");
    expect(persisted.proposed_slots[0]!.start).toBe("2026-08-25T14:00");
    expect(persisted.participants.every((participant) => participant.response === "pending")).toBe(
      true
    );
  });
});
