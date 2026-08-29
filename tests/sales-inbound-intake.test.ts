import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { classifyMail } from "../src/lib/correspondence/mail-triage.js";
import {
  loadMailTriageQueue,
  upsertTriageEntry,
} from "../src/lib/correspondence/mail-triage-queue.js";
import {
  intakeInquiriesFromTriage,
  nextInquiryId,
} from "../src/lib/sales-inbound-intake.js";
import type { MailTriageRules } from "../../schemas/correspondence/mail-triage-rules.js";
import type { SalesInquiry } from "../../schemas/index.js";

const RULES: MailTriageRules = {
  version: 1,
  inquiry: {
    subject_keywords: ["お問い合わせ", "提携"],
  },
  routing: {
    spam: "ignore",
    suspicious: "archive",
    p0_ham: "secretary",
    inquiry_ham: "sales_inbound",
    default_ham: "secretary",
  },
};

const SENDER_EMAIL = "partner@example.co.jp";
const BODY_SNIPPET = "機密の本文スニペットは保存しない";

function executiveDir(): string {
  return join(getDataDir(), "executive");
}

function salesInboundDir(): string {
  return join(getDataDir(), "sales", "inbound");
}

function inquiriesPath(): string {
  return join(salesInboundDir(), "inquiries.yaml");
}

function cleanup(): void {
  const exec = executiveDir();
  if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
  const sales = join(getDataDir(), "sales");
  if (existsSync(sales)) rmSync(sales, { recursive: true, force: true });
}

function seedDemoQueues(): void {
  mkdirSync(executiveDir(), { recursive: true });
  writeFileSync(
    join(executiveDir(), "mail-triage-queue.yaml"),
    "version: 1\nentries: []\n",
    "utf-8",
  );
}

function addTriageEntry(
  entry: Parameters<typeof upsertTriageEntry>[0],
): void {
  upsertTriageEntry(entry);
}

describe("sales inbound mail intake", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedDemoQueues();
  });

  afterEach(() => cleanup());

  it("routes inquiry subjects to sales_inbound", () => {
    const classified = classifyMail(
      {
        from: "Partner <partner@example.co.jp>",
        subject: "お問い合わせ：提携について",
        receivedAt: "2026-08-24T10:00:00+09:00",
        textPreview: "",
      },
      RULES,
    );
    expect(classified.routing).toBe("sales_inbound");
    expect(classified.rule_hits.some((h) => h.startsWith("inquiry:"))).toBe(true);
  });

  it("keeps p0 urgent on secretary", () => {
    const classified = classifyMail(
      {
        from: "Urgent <u@example.com>",
        subject: "【緊急】お問い合わせ",
        receivedAt: "2026-08-24T10:00:00+09:00",
        textPreview: "",
      },
      {
        ...RULES,
        importance: { p0: { subject_keywords: ["緊急"] } },
      },
    );
    expect(classified.routing).toBe("secretary");
  });

  it("allocates sequential inquiry ids", () => {
    const id = nextInquiryId(
      [
        { id: "INQ-2026-001", subject: "a", status: "new", company: "A" },
        { id: "INQ-2026-005", subject: "b", status: "new", company: "B" },
      ] as SalesInquiry[],
      "2026",
    );
    expect(id).toBe("INQ-2026-006");
  });

  it("creates inquiry from pending sales_inbound triage and updates handoff", () => {
    addTriageEntry({
      id: "MSG-inbound-001",
      received_at: "2026-08-24T10:00:00+09:00",
      from: `Partner <${SENDER_EMAIL}>`,
      subject: "お問い合わせ：提携について",
      importance: "p2",
      urgency: "week",
      disposition: "ham",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-inbound-001.eml",
      rule_hits: [],
    });

    const result = intakeInquiriesFromTriage();
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatch(/^INQ-2026-\d{3}$/);

    const queue = loadMailTriageQueue();
    const entry = queue.entries.find((e) => e.id === "MSG-inbound-001");
    expect(entry?.handoff_status).toBe("handed_off");
    expect(entry?.handoff_ref).toBe(result.created[0]);

    const raw = readFileSync(inquiriesPath(), "utf-8");
    expect(raw).toContain(`source_ref: MSG-inbound-001`);
    expect(raw).toContain("source: email");
    expect(raw).not.toContain(SENDER_EMAIL);
    expect(raw).not.toContain(BODY_SNIPPET);
  });

  it("is idempotent on second intake run", () => {
    addTriageEntry({
      id: "MSG-inbound-002",
      received_at: "2026-08-24T11:00:00+09:00",
      from: "Acme <acme@example.com>",
      subject: "お問い合わせ",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-inbound-002.eml",
      rule_hits: [],
    });

    const first = intakeInquiriesFromTriage();
    expect(first.created).toHaveLength(1);

    const second = intakeInquiriesFromTriage();
    expect(second.created).toHaveLength(0);
  });

  it("skips duplicate source_ref even when handoff reset to pending", () => {
    addTriageEntry({
      id: "MSG-inbound-003",
      received_at: "2026-08-24T12:00:00+09:00",
      from: "Retry <retry@example.com>",
      subject: "提携のお問い合わせ",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-inbound-003.eml",
      rule_hits: [],
    });

    intakeInquiriesFromTriage();

    writeFileSync(
      join(executiveDir(), "mail-triage-queue.yaml"),
      readFileSync(join(executiveDir(), "mail-triage-queue.yaml"), "utf-8").replace(
        "handoff_status: handed_off",
        "handoff_status: pending",
      ),
      "utf-8",
    );

    const retry = intakeInquiriesFromTriage();
    expect(retry.created).toHaveLength(0);
    expect(retry.skipped).toContain("MSG-inbound-003");
  });

  it("skips spam disposition entries", () => {
    addTriageEntry({
      id: "MSG-inbound-spam",
      received_at: "2026-08-24T13:00:00+09:00",
      from: "Spammer <spam@bad.example>",
      subject: "お問い合わせ",
      routing: "sales_inbound",
      disposition: "spam",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-inbound-spam.eml",
      rule_hits: [],
    });

    const result = intakeInquiriesFromTriage();
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toContain("MSG-inbound-spam");
    expect(existsSync(inquiriesPath())).toBe(false);
  });

  it("skips second intake with same gmail_thread_id", () => {
    addTriageEntry({
      id: "MSG-gmail-1",
      received_at: "2026-08-24T15:00:00+09:00",
      from: "Thread <t@example.com>",
      subject: "お問い合わせ：thread",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-gmail-1.eml",
      rule_hits: [],
      gmail_thread_id: "gmail-thread-dup-001",
    });
    const first = intakeInquiriesFromTriage();
    expect(first.created).toHaveLength(1);

    addTriageEntry({
      id: "MSG-gmail-2",
      received_at: "2026-08-24T16:00:00+09:00",
      from: "Thread <t@example.com>",
      subject: "Re: お問い合わせ：thread",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-gmail-2.eml",
      rule_hits: [],
      gmail_thread_id: "gmail-thread-dup-001",
    });
    const second = intakeInquiriesFromTriage();
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toContain("MSG-gmail-2");
  });

  it("dry-run does not write files", () => {
    addTriageEntry({
      id: "MSG-inbound-dry",
      received_at: "2026-08-24T14:00:00+09:00",
      from: "Dry <dry@example.com>",
      subject: "お問い合わせ",
      routing: "sales_inbound",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-inbound-dry.eml",
      rule_hits: [],
    });

    const queuePath = join(executiveDir(), "mail-triage-queue.yaml");
    const queueMtimeBefore = statSync(queuePath).mtimeMs;
    const inquiriesExistsBefore = existsSync(inquiriesPath());

    const result = intakeInquiriesFromTriage({ dryRun: true });
    expect(result.dry_run).toBe(true);
    expect(result.created).toHaveLength(1);

    expect(existsSync(inquiriesPath())).toBe(inquiriesExistsBefore);
    expect(statSync(queuePath).mtimeMs).toBe(queueMtimeBefore);

    const queue = loadMailTriageQueue();
    expect(queue.entries[0]?.handoff_status).toBe("pending");
  });
});
