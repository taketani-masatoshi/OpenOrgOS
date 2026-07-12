import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMailReceivePoller } from "../src/lib/correspondence/mail-receive-poller.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedDryRunMailConfig,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

vi.mock("../src/lib/correspondence/mail-receive-sync.js", () => ({
  syncMailReceive: vi.fn(async () => ({ fetched: 0, saved: 0, skipped: 0 })),
}));

vi.mock("../src/lib/protocol/email-wire-ingest.js", () => ({
  scanMailReceivedForWire: vi.fn(async () => ({
    scanned: 0,
    ingested: 0,
    ingested_event_ids: [],
  })),
}));

const tenantId = "test-scheduling-mail-poller";

describe("mail receive poller scheduling integration", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedDryRunMailConfig();
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanupSchedulingTenant(tenantId);
  });

  it("runs scheduling reminder poll even when mail sync fetches nothing", async () => {
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-712", 4),
      reminder_due_at: "2026-01-01T00:00:00.000Z",
    });
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-POLLER-ALICE",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      })
    );

    const poller = createMailReceivePoller({
      now: () => new Date("2027-01-04T00:00:00.000Z"),
    });
    await poller.pollOnce();

    const updated = findSchedulingCase(initial.id)!;
    expect(updated.correspondence.some((record) => record.kind === "reminder")).toBe(true);
  });
});
