import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { schedulingCaseSchema, type SchedulingCase } from "../../schemas/executive/scheduling-cases.js";
import type { MailTriageEntry } from "../../schemas/correspondence/mail-triage.js";
import { getTenantsDir, setTenantId } from "../../src/lib/tenant.js";
import { getDataDir, writeYamlFile } from "../../src/lib/utils.js";
import { getMailReceivedDir } from "../../src/lib/correspondence/paths.js";
import { upsertTriageEntry } from "../../src/lib/correspondence/mail-triage-queue.js";
import { clearSecretaryDraftToneCacheForTests } from "../../src/lib/secretary/tenant-behavior.js";

export const SCHEDULING_FIXTURE_DIR = join(
  process.cwd(),
  "tests",
  "fixtures",
  "scheduling"
);

export function seedSchedulingTenant(tenantId: string): string {
  clearSecretaryDraftToneCacheForTests();
  const root = join(getTenantsDir(), tenantId);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "data", "executive"), { recursive: true });
  mkdirSync(join(root, "data", "org"), { recursive: true });
  mkdirSync(join(root, "docs", "executive", "correspondence-drafts"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "tenant.yaml"),
    `id: ${tenantId}\nname: Scheduling Test\nlifecycle: test\n`
  );
  writeFileSync(
    join(root, "data", "company.yaml"),
    "name: Scheduling Test\nfiscal_year_end_month: 12\nbusiness_description: Test tenant\npublic_disclosure:\n  representative_email: ceo@scheduling.test\n"
  );
  writeFileSync(
    join(root, "data", "executive", "scheduling-cases.yaml"),
    "version: 1\ncases: []\n"
  );
  writeFileSync(join(root, "data", "executive", "calendar.yaml"), "events: []\n");
  writeFileSync(
    join(root, "data", "executive", "mail-triage-queue.yaml"),
    "version: 1\nentries: []\n"
  );
  writeFileSync(
    join(root, "data", "executive", "mail-interpretation-queue.yaml"),
    "version: 1\nentries: []\n"
  );
  writeFileSync(
    join(root, "data", "executive", "ceo-inline-questions.yaml"),
    "version: 1\nquestions: []\n"
  );
  writeFileSync(
    join(root, "data", "executive", "sender-identification-queue.yaml"),
    "version: 1\nentries: []\n"
  );
  mkdirSync(join(root, "rules"), { recursive: true });
  writeFileSync(
    join(root, "rules", "secretary_behavior.md"),
    [
      "# Secretary tone (test)",
      "",
      "## 日程調整下書き",
      "",
      "- 候補提示の結び: 何卒よろしくお願い申し上げます。",
      "- リマインドの結び: お手数ですがご回答をお願いいたします。",
      "- 確定通知の結び: 当日は何卒よろしくお願いいたします。",
      "",
    ].join("\n")
  );
  writeYamlFile(join(root, "data", "org", "pending-approvals.yaml"), {
    version: "1",
    approvals: [],
  });
  writeYamlFile(join(root, "data", "org", "operators.yaml"), {
    version: "1",
    operators: [
      {
        operator_id: "ceo-test",
        display_name: "Test CEO",
        approver_name: "Test CEO",
        role: "ceo",
        status: "active",
      },
      {
        operator_id: "readonly-test",
        display_name: "Readonly",
        role: "readonly",
        status: "active",
      },
    ],
  });
  setTenantId(tenantId);
  return root;
}

export function cleanupSchedulingTenant(tenantId: string): void {
  rmSync(join(getTenantsDir(), tenantId), { recursive: true, force: true });
}

export function schedulingCase(
  id = "SCH-2026-701",
  participantCount = 4
): SchedulingCase {
  const now = new Date().toISOString();
  const names = ["Alice", "Bob", "Carol", "Dave"];
  return schedulingCaseSchema.parse({
    id,
    title: "統合日程調整",
    status: "awaiting_responses",
    created_at: now,
    updated_at: now,
    participants: names.slice(0, participantCount).map((name, index) => ({
      id: `PART-${String(index + 1).padStart(3, "0")}`,
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: "external",
      response: "pending",
    })),
    proposed_slots: [
      {
        id: "SLOT-001",
        start: "2026-08-20T10:00",
        end: "2026-08-20T11:00",
        label: "2026-08-20 10:00",
      },
      {
        id: "SLOT-002",
        start: "2026-08-21T10:00",
        end: "2026-08-21T11:00",
        label: "2026-08-21 10:00",
      },
    ],
    meeting_format: "online",
    duration_minutes: 60,
    mail_thread_ids: ["THREAD-701"],
  });
}

export function copySchedulingEml(fixtureName: string, targetName?: string): string {
  mkdirSync(getMailReceivedDir(), { recursive: true });
  const filename = targetName ?? fixtureName;
  cpSync(
    join(SCHEDULING_FIXTURE_DIR, fixtureName),
    join(getMailReceivedDir(), filename)
  );
  return filename;
}

export function schedulingTriage(opts: {
  id: string;
  caseId?: string;
  from: string;
  fixture: string;
  subject?: string;
  threadIds?: string[];
}): MailTriageEntry {
  const filename = copySchedulingEml(opts.fixture, `${opts.id}.eml`);
  return upsertTriageEntry({
    id: opts.id,
    received_at: new Date().toISOString(),
    from: opts.from,
    sender_email: opts.from.match(/<([^>]+)>/)?.[1],
    sender_known: true,
    subject: opts.subject ?? "Re: 【日程調整】統合日程調整",
    importance: "p2",
    urgency: "none",
    disposition: "ham",
    routing: "secretary",
    handoff_status: "pending",
    eml_ref: `records/executive/mail-received/${basename(filename)}`,
    rule_hits: ["schedule"],
    scheduling_case_id: opts.caseId,
    mail_thread_ids: opts.threadIds ?? ["THREAD-701"],
  });
}

export function seedDryRunMailConfig(): void {
  mkdirSync(join(getDataDir(), "../records/executive"), { recursive: true });
  writeYamlFile(join(getDataDir(), "../records/executive/mail-config.yaml"), {
    provider: "smtp",
    from: { name: "Secretary", email: "ceo@scheduling.test" },
    smtp: { host: "smtp.test.local", port: 587, secure: false },
    receive: { sync: "stub", scheduling_reminder_after_hours: 72 },
  });
  process.env.ORGOS_SMTP_USER = "ceo@scheduling.test";
  process.env.ORGOS_SMTP_PASSWORD = "test-only";
}
