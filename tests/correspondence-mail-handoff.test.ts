import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import { formatInboundHandoffMarkdown } from "../src/lib/correspondence/mail-handoff.js";
import { saveMailInterpretation } from "../src/lib/correspondence/mail-interpretation.js";
import { mailInterpretationResultSchema } from "../schemas/correspondence/mail-interpretation.js";
import { upsertSenderIdentification } from "../src/lib/correspondence/sender-identification-queue.js";
import { askCeoInline } from "../src/lib/correspondence/ceo-inline-question.js";

function cleanup(): void {
  const exec = join(getDataDir(), "executive");
  if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
}

describe("correspondence mail handoff", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "executive", "mail-triage-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "sender-identification-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "mail-interpretation-queue.yaml"),
      "version: 1\nentries: []\n",
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "executive", "ceo-inline-questions.yaml"),
      "version: 1\nquestions: []\n",
      "utf-8"
    );
  });

  afterEach(() => cleanup());

  it("includes sender, interpretation, CEO, and recommended sections", () => {
    const entry = upsertTriageEntry({
      id: "MSG-handoff-001",
      source_message_id: "<h@t>",
      received_at: "2026-07-10T08:00:00+09:00",
      from: "unknown@example.com",
      subject: "ノート返却のお願い",
      importance: "p1",
      urgency: "today",
      disposition: "ham",
      routing: "secretary",
      rule_hits: [],
      triaged_at: new Date().toISOString(),
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-handoff-001.eml",
      sender_known: false,
      identification_status: "pending_ceo",
    });

    upsertSenderIdentification({
      mail_id: entry.id,
      sender_email: "unknown@example.com",
      status: "pending_ceo",
    });

    saveMailInterpretation(
      mailInterpretationResultSchema.parse({
        mail_id: entry.id,
        interpreted_at: new Date().toISOString(),
        intent: "return_item",
        who_lent: "sender",
        who_must_return: "recipient",
        action_required: true,
        summary_l1: "差出人がノート返却を依頼",
        agreement: 0.5,
        dissent_notes: ["who_lent: unclear"],
        votes: [],
        needs_ceo_confirm: true,
        ceo_questions: [],
      })
    );

    askCeoInline({
      mailId: entry.id,
      subject: "解釈確認",
      contextL1: "一致率 50%",
      fields: [{ id: "interpret_confirm", label: "解釈確認", type: "yes_no" }],
    });

    const md = formatInboundHandoffMarkdown(entry);
    expect(md).toContain("## Sender identification");
    expect(md).toContain("pending_ceo");
    expect(md).toContain("## Interpretation ensemble");
    expect(md).toContain("return_item");
    expect(md).toContain("## CEO inline questions");
    expect(md).toContain("CEO-Q-");
    expect(md).toContain("## Recommended actions");
    expect(md).not.toMatch(/assert|must|shall/i);
  });
});
