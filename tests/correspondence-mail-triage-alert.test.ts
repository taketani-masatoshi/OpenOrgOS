import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import {
  formatMailTriageDesktopAlert,
  formatMailTriagePriorityLabel,
  filterHighPriorityMailIntake,
} from "../src/lib/correspondence/mail-triage-alert.js";
import { notifyMailTriageHighPriority } from "../src/lib/correspondence/mail-handoff.js";
import { findTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import * as macosNotify from "../src/lib/notifications/macos-notify.js";
import * as push from "../src/lib/notifications/push.js";

function cleanup(): void {
  const exec = join(getDataDir(), "executive");
  if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
}

describe("correspondence mail triage alert", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "executive", "mail-triage-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );
    process.env.ORGOS_SKIP_MACOS_NOTIFY = "1";
  });

  afterEach(() => {
    cleanup();
    delete process.env.ORGOS_SKIP_MACOS_NOTIFY;
    vi.restoreAllMocks();
  });

  it("labels p0 immediate mail for CEO alert", () => {
    expect(
      formatMailTriagePriorityLabel({ importance: "p0", urgency: "immediate" })
    ).toBe("P0 · 至急");
    expect(formatMailTriagePriorityLabel({ importance: "p2", urgency: "today" })).toBe(
      "本日中"
    );
  });

  it("builds desktop alert without L2 body", () => {
    const alert = formatMailTriageDesktopAlert({
      id: "MSG-001",
      source_message_id: "<x>",
      received_at: "2026-07-13T08:00:00+09:00",
      from: "partner@example.com",
      subject: "至急: 本日の件",
      importance: "p0",
      urgency: "immediate",
      disposition: "ham",
      routing: "secretary",
      rule_hits: [],
      triaged_at: new Date().toISOString(),
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-001.eml",
      sender_known: true,
    });
    expect(alert.title).toBe("MAL Mail");
    expect(alert.subtitle).toMatch(/P0|至急/);
    expect(alert.body).toContain("至急: 本日の件");
    expect(alert.body).toContain("partner@example.com");
    expect(alert.kind).toBe("mail_high");
  });

  it("filters high priority mail intake items", () => {
    const filtered = filterHighPriorityMailIntake([
      { importance: "p2" as const, urgency: "none" as const },
      { importance: "p1" as const, urgency: "week" as const },
      { importance: "p2" as const, urgency: "today" as const },
    ]);
    expect(filtered).toHaveLength(2);
  });

  it("notifyMailTriageHighPriority marks notified_at and pushes once", async () => {
    upsertTriageEntry({
      id: "MSG-alert-001",
      source_message_id: "<a>",
      received_at: "2026-07-13T09:00:00+09:00",
      from: "ceo-test@example.com",
      subject: "URGENT subject",
      importance: "p0",
      urgency: "immediate",
      disposition: "ham",
      routing: "secretary",
      rule_hits: ["urgency:immediate"],
      triaged_at: new Date().toISOString(),
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-alert-001.eml",
      sender_known: true,
    });

    const desktopSpy = vi.spyOn(macosNotify, "displayMacOSNotification").mockResolvedValue(true);
    const pushSpy = vi.spyOn(push, "pushNotifications").mockResolvedValue({
      event: "mail_triage_high",
      sent: [],
    });

    const count = await notifyMailTriageHighPriority(["MSG-alert-001"]);
    expect(count).toBe(1);
    expect(desktopSpy).toHaveBeenCalledOnce();
    expect(pushSpy).toHaveBeenCalledOnce();
    expect(pushSpy.mock.calls[0]?.[2]?.mail_triage?.[0]?.subject).toBe("URGENT subject");

    const updated = findTriageEntry("MSG-alert-001");
    expect(updated?.notified_at).toBeTruthy();
  });
});
