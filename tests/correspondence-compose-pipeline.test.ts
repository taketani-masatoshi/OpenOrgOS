import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import {
  getExecutiveRecordsDir,
  getMailConfigPath,
  getMailReceivedDir,
} from "../src/lib/correspondence/paths.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import { sendApprovedCorrespondence } from "../src/lib/correspondence/send-gate.js";
import { humanApproveOrgApproval } from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  assertCorrespondenceClaims,
  CorrespondenceClaimsError,
  parseClaimsFromDraftNotes,
} from "../src/lib/correspondence/claims-assert.js";
import {
  addDeliveryClaims,
  addInventoryClaims,
  buildFactsVerify,
  type CorrespondenceClaim,
} from "../src/lib/correspondence/facts-verify.js";
import { handleCorrespondenceCaseSent } from "../src/lib/correspondence/case-status.js";
import {
  buildAsanaPushPayload,
  linkAsanaCase,
  loadAsanaLinks,
} from "../src/lib/integrations/asana-adapter.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import { salesInquiriesFileSchema, salesPipelineFileSchema } from "../schemas/sales.js";
import { loadSalesInquiries, saveSalesInquiries, saveSalesPipeline, loadSalesPipeline } from "../src/lib/data.js";
import { isAttachmentPathAllowlisted, searchCorrespondenceKnowledge } from "../src/lib/correspondence/knowledge-search.js";
import { composeCorrespondenceReply } from "../src/lib/correspondence/compose.js";
import { triageEmlFile } from "../src/lib/correspondence/mail-triage.js";
import { fetchGmailThreadHistory } from "../src/lib/correspondence/gmail-thread-fetch.js";
import type { GmailApiClient } from "../src/lib/correspondence/gmail-receive-sync.js";
import { pushAsanaCase } from "../src/lib/integrations/asana-adapter.js";

function seedContact(email: string): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });
  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({
      contacts: [{ id: "EXT-001", name: "Partner", org: "Acme", email }],
    }),
    "utf-8",
  );
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
    join(getDataDir(), "company-events.yaml"),
    join(getDataDir(), "sales"),
    join(getDataDir(), "integrations"),
    join(getDataDir(), "executive", "mail-triage-queue.yaml"),
    join(getDataDir(), "executive", "external-contacts.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDocsDir(), "company", "events"),
    getExecutiveRecordsDir(),
    getMailReceivedDir(),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  delete process.env.ORGOS_SMTP_USER;
  delete process.env.ORGOS_SMTP_PASSWORD;
}

function seedMailSetup(): void {
  const companyPath = join(getDataDir(), "company.yaml");
  const company = existsSync(companyPath)
    ? (YAML.parse(readFileSync(companyPath, "utf-8")) as Record<string, unknown>)
    : { name: "Test Co" };
  company.public_disclosure = { representative_email: "rep@test.co.jp" };
  writeFileSync(companyPath, YAML.stringify(company), "utf-8");
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  writeFileSync(
    getMailConfigPath(),
    YAML.stringify({
      provider: "smtp",
      from: { name: "Test Co", email: "rep@test.co.jp" },
      smtp: { host: "smtp.test.local", port: 587, secure: false },
      receive: { sync: "stub" },
    }),
    "utf-8",
  );
  process.env.ORGOS_SMTP_USER = "u";
  process.env.ORGOS_SMTP_PASSWORD = "p";
}

describe("mail context compose pipeline", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    seedContact("partner@example.com");
  });
  afterEach(() => cleanup());

  it("rejects body amounts not in verified claims", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "quote:1",
        kind: "amount",
        label: "band",
        value: "100-200",
        source: "quotes",
        verified: true,
      },
    ];
    expect(() =>
      assertCorrespondenceClaims(
        {
          body: "お見積は 999999 円です。",
          to: "partner@example.com",
          contact_ref: undefined,
          attachment_refs: [],
        },
        claims,
      ),
    ).toThrow(CorrespondenceClaimsError);
  });

  it("rejects inventory wording when inventory claim unverified", () => {
    const claims: CorrespondenceClaim[] = [];
    addInventoryClaims(claims, []);
    expect(claims.some((c) => c.kind === "inventory" && !c.verified)).toBe(true);
    expect(() =>
      assertCorrespondenceClaims(
        {
          body: "在庫は十分ございます。",
          to: "partner@example.com",
          attachment_refs: [],
        },
        claims,
      ),
    ).toThrow(/在庫/);
  });

  it("rejects 納期 wording when delivery claim unverified", () => {
    const claims: CorrespondenceClaim[] = [];
    addDeliveryClaims(undefined, claims, []);
    expect(() =>
      assertCorrespondenceClaims(
        {
          body: "納期は来週になります。",
          to: "partner@example.com",
          attachment_refs: [],
        },
        claims,
      ),
    ).toThrow(/納期/);
  });

  it("parses claims-json from draft notes", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "a",
        kind: "text",
        label: "t",
        value: "v",
        source: "s",
        verified: true,
      },
    ];
    const notes = `compose:mail=MSG-1\nclaims-json:${JSON.stringify(claims)}`;
    expect(parseClaimsFromDraftNotes(notes)).toEqual(claims);
  });

  it("does not treat follow-up due alone as verified delivery", () => {
    const claims: CorrespondenceClaim[] = [];
    const warnings: string[] = [];
    addDeliveryClaims(
      {
        kind: "inquiry",
        id: "INQ-2026-099",
        status: "triaged",
        next_action: "フォローアップ",
        next_action_due: "2026-09-01",
        mail_thread_ids: [],
        gmail_thread_ids: [],
      },
      claims,
      warnings,
    );
    expect(claims.some((c) => c.kind === "delivery" && c.verified)).toBe(false);
    expect(warnings.some((w) => /納期/.test(w))).toBe(true);
  });

  it("verifies delivery when next_action is 納期系", () => {
    const claims: CorrespondenceClaim[] = [];
    addDeliveryClaims(
      {
        kind: "inquiry",
        id: "INQ-2026-098",
        status: "triaged",
        next_action: "納期回答",
        next_action_due: "2026-09-20",
        mail_thread_ids: [],
        gmail_thread_ids: [],
      },
      claims,
      [],
    );
    expect(claims.some((c) => c.kind === "delivery" && c.verified && c.value === "2026-09-20")).toBe(
      true,
    );
  });

  it("updates inquiry to responded after send hook", () => {
    saveSalesInquiries(
      salesInquiriesFileSchema.parse({
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-001",
            subject: "Demo",
            status: "triaged",
            company: "Acme",
          },
        ],
      }),
    );
    const { draft } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Re: Demo",
      body: "Hello",
      createdBy: "secretary",
      inquiryId: "INQ-2026-001",
      notes: "case:INQ-2026-001",
      proposeApproval: false,
    });
    const sent = { ...draft, status: "sent" as const, sent_by: "OP-001" };
    const updated = handleCorrespondenceCaseSent(sent, { actor: "OP-001" });
    expect(updated?.status).toBe("responded");
    expect(updated?.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("blocks L2 attachment paths", () => {
    expect(isAttachmentPathAllowlisted("records/executive/secret.pdf")).toBe(false);
    expect(isAttachmentPathAllowlisted("docs/sales/quotes/q1.pdf")).toBe(true);
  });

  it("Asana push payload is L1-only (no email body)", () => {
    saveSalesInquiries(
      salesInquiriesFileSchema.parse({
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-002",
            subject: "Partner ask",
            status: "new",
            company: "Partner Co",
            next_action_due: "2026-09-01",
          },
        ],
      }),
    );
    const payload = buildAsanaPushPayload("INQ-2026-002");
    expect(payload.name).toContain("INQ-2026-002");
    expect(payload.notes).toContain("OrgOS case");
    expect(payload.notes).not.toMatch(/@/);
    expect(payload.due_on).toBe("2026-09-01");
    linkAsanaCase({ caseId: "INQ-2026-002", taskGid: "12345" });
    expect(loadAsanaLinks().links[0]?.task_gid).toBe("12345");
  });

  it("send-gate style-lint fails on forbidden phrase when claims present", async () => {
    seedMailSetup();
    upsertTriageEntry({
      id: "MSG-20260828-test01",
      received_at: new Date().toISOString(),
      from: "partner@example.com",
      subject: "Hi",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-20260828-test01.eml",
      rule_hits: [],
      sender_known: false,
      mail_thread_ids: [],
    });
    const claims: CorrespondenceClaim[] = [
      {
        id: "recipient:primary",
        kind: "recipient",
        label: "宛先",
        value: "partner@example.com",
        source: "test",
        verified: true,
      },
    ];
    expect(() =>
      createCorrespondenceDraft({
        channel: "email",
        to: "partner@example.com",
        subject: "Bad",
        body: "これは自動送信しました。",
        createdBy: "secretary",
        notes: `claims-json:${JSON.stringify(claims)}`,
      }),
    ).toThrow(/style lint|禁句|自動送信/);
  });

  it("E2E: triage → compose → approve → send → INQ responded", async () => {
    seedMailSetup();
    saveSalesInquiries(
      salesInquiriesFileSchema.parse({
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-010",
            subject: "製品について",
            status: "triaged",
            company: "Acme",
            next_action: "納期回答",
            next_action_due: "2026-09-15",
          },
        ],
      }),
    );

    const receivedDir = getMailReceivedDir();
    mkdirSync(receivedDir, { recursive: true });
    const filename = "MSG-20260828-e2e01.eml";
    const eml = [
      "From: Partner <partner@example.com>",
      "To: rep@test.co.jp",
      "Subject: 製品について",
      "Message-ID: <e2e-thread-001@example.com>",
      "Date: Fri, 28 Aug 2026 00:00:00 +0900",
      "",
      "お世話になっております。製品資料をください。",
      "",
    ].join("\r\n");
    writeFileSync(join(receivedDir, filename), eml, "utf-8");
    writeFileSync(
      join(receivedDir, `${filename}.meta.json`),
      JSON.stringify({
        gmail_thread_id: "thread-e2e-001",
        gmail_message_id: "gmail-msg-e2e-001",
      }),
      "utf-8",
    );

    const { entry } = await triageEmlFile(filename, { identifySender: false });
    expect(entry.gmail_thread_id).toBe("thread-e2e-001");

    const composed = await composeCorrespondenceReply({
      mailId: entry.id,
      caseId: "INQ-2026-010",
      proposeApproval: true,
    });
    expect(composed.draft.status).toBe("pending_approval");
    expect(composed.draft.inquiry_id).toBe("INQ-2026-010");
    expect(composed.draft.body).not.toMatch(/在庫|納期/);
    expect(parseClaimsFromDraftNotes(composed.draft.notes).length).toBeGreaterThan(0);

    const facts = buildFactsVerify({ mailId: entry.id, caseId: "INQ-2026-010" });
    expect(facts.claims.some((c) => c.kind === "delivery" && c.verified)).toBe(true);

    humanApproveOrgApproval({
      approvalId: composed.approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
      humanReviewConfirmed: true,
    });

    const sent = await sendApprovedCorrespondence({
      draftId: composed.draft.draft_id,
      operatorId: "OP-001",
    });
    expect(sent.draft.status).toBe("sent");

    const inq = loadSalesInquiries()?.inquiries.find((i) => i.id === "INQ-2026-010");
    expect(inq?.status).toBe("responded");
    expect(inq?.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fetches Gmail thread via injected client and is idempotent", async () => {
    const raw = [
      "From: Partner <partner@example.com>",
      "To: rep@test.co.jp",
      "Subject: Thread fetch",
      "Message-ID: <thread-fetch-1@example.com>",
      "Date: Fri, 28 Aug 2026 01:00:00 +0900",
      "",
      "本文です。",
      "",
    ].join("\r\n");
    const client: GmailApiClient = {
      async listMessageIds() {
        return [];
      },
      async getThreadMessageIds() {
        return ["gm-msg-thread-1"];
      },
      async getMessageRaw(id) {
        return { id, threadId: "thread-fetch-001", raw };
      },
    };

    const first = await fetchGmailThreadHistory({
      threadId: "thread-fetch-001",
      client,
      autoLink: false,
    });
    expect(first.fetched).toBe(1);
    expect(first.saved).toHaveLength(1);
    expect(first.summaries[0]?.subject).toMatch(/Thread fetch/);

    const second = await fetchGmailThreadHistory({
      threadId: "thread-fetch-001",
      client,
      autoLink: false,
    });
    expect(second.saved).toHaveLength(0);
    expect(second.summaries).toHaveLength(1);
  });

  it("E2E DEAL: compose → approve → send updates follow-up tags", async () => {
    seedMailSetup();
    saveSalesPipeline(
      salesPipelineFileSchema.parse({
        version: 1,
        deals: [
          {
            id: "DEAL-2026-001",
            title: "Acme 導入",
            stage: "proposal",
            owner_name: "Demo",
            counterparty: "Acme",
            amount_band: "100-200",
            next_action: "提案フォロー",
          },
        ],
      }),
    );

    const receivedDir = getMailReceivedDir();
    mkdirSync(receivedDir, { recursive: true });
    const filename = "MSG-20260828-deal01.eml";
    writeFileSync(
      join(receivedDir, filename),
      [
        "From: Partner <partner@example.com>",
        "To: rep@test.co.jp",
        "Subject: 提案の件",
        "Message-ID: <deal-e2e@example.com>",
        "Date: Fri, 28 Aug 2026 02:00:00 +0900",
        "",
        "ご提案ありがとうございます。",
        "",
      ].join("\r\n"),
      "utf-8",
    );

    const { entry } = await triageEmlFile(filename, { identifySender: false });
    const composed = await composeCorrespondenceReply({
      mailId: entry.id,
      caseId: "DEAL-2026-001",
      proposeApproval: true,
    });
    expect(composed.draft.deal_id).toBe("DEAL-2026-001");
    expect(composed.claims.some((c) => c.kind === "amount" && c.verified)).toBe(true);

    humanApproveOrgApproval({
      approvalId: composed.approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
      humanReviewConfirmed: true,
    });
    await sendApprovedCorrespondence({
      draftId: composed.draft.draft_id,
      operatorId: "OP-001",
    });

    const deal = loadSalesPipeline()?.deals.find((d) => d.id === "DEAL-2026-001");
    expect(deal?.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(deal?.tags).toContain("outbound_sent");
  });

  it("Asana push uses L1 payload and mock HTTP", async () => {
    saveSalesInquiries(
      salesInquiriesFileSchema.parse({
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-020",
            subject: "Asana link",
            status: "triaged",
            company: "Acme",
            next_action_due: "2026-10-01",
          },
        ],
      }),
    );
    linkAsanaCase({ caseId: "INQ-2026-020", taskGid: "12345" });
    expect(loadAsanaLinks().links).toHaveLength(1);
    const payload = buildAsanaPushPayload("INQ-2026-020");
    expect(payload.notes).toMatch(/OrgOS case/);
    expect(payload.notes).not.toMatch(/@|口座|password/i);

    process.env.ORGOS_ASANA_PAT = "test-pat";
    const originalFetch = globalThis.fetch;
    let putCount = 0;
    globalThis.fetch = (async () => {
      putCount += 1;
      return new Response(JSON.stringify({ data: { gid: "12345" } }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await pushAsanaCase("INQ-2026-020");
      expect(result.ok).toBe(true);
      expect(putCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.ORGOS_ASANA_PAT;
    }
  });

  it("knowledge search returns structured quote / contract hits for keywords", () => {
    mkdirSync(join(getDataDir(), "sales"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "sales", "quotes.yaml"),
      YAML.stringify({
        version: 1,
        quotes: [
          {
            id: "QUOTE-2026-001",
            deal_id: "DEAL-2026-001",
            account_id: "CUST-2026-001",
            status: "accepted",
            amount_band: "50-100",
            notes: "標準見積",
          },
        ],
      }),
      "utf-8",
    );
    const hits = searchCorrespondenceKnowledge("見積 価格");
    expect(hits.some((h) => h.path.includes("QUOTE-2026-001") || h.title === "QUOTE-2026-001")).toBe(
      true,
    );
  });
});
