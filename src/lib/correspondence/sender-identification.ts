import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SenderIdentificationEntry } from "../../../schemas/correspondence/sender-identification.js";
import { registerContact } from "../secretary/contact-registry.js";
import { upsertTriageEntry, findTriageEntry } from "./mail-triage-queue.js";
import {
  findSenderIdentification,
  upsertSenderIdentification,
  listPendingCeoIdentification,
} from "./sender-identification-queue.js";
import { resolveMailSender } from "./sender-resolution.js";
import { formatWebSearchSummary, searchWebForSender } from "./sender-enrichment.js";
import { writeSecretaryConsultFile } from "../secretary-consult.js";
import { interpretMailFromTriageEntry } from "./mail-interpretation.js";
import { askCeoInline } from "./ceo-inline-question.js";
import { isCeoInlineQuestionMode } from "./mail-interpret-ensemble.js";

export interface IdentifySenderOptions {
  skipWebSearch?: boolean;
  skipCeoAsk?: boolean;
  dryRun?: boolean;
}

export interface IdentifySenderResult {
  triage: MailTriageEntry;
  identification?: SenderIdentificationEntry;
  action: "known" | "enriched" | "ceo_asked" | "skipped";
}

import type { MailInterpretationResult } from "../../../schemas/correspondence/mail-interpretation.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";

function buildCeoQuestion(
  entry: MailTriageEntry,
  idEntry: SenderIdentificationEntry,
  interpretation?: MailInterpretationResult
): {
  subject: string;
  summary: string;
  questions: string[];
} {
  const web = idEntry.web_search;
  const webBlock = web?.hits.length
    ? formatWebSearchSummary({
        query: web.query,
        hits: web.hits,
        note: web.note,
      })
    : "（Web 検索ヒットなし）";

  const subject = `未知の送信者: ${entry.from} — ${entry.subject}`;
  const summary = [
    `メール ID: ${entry.id}`,
    `差出人: ${entry.from}`,
    `件名: ${entry.subject}`,
    `受信: ${entry.received_at}`,
    "",
    "## Web 検索（参考 · 正確性未確認）",
    webBlock,
    "",
    "※ 上記は自動検索の参考情報です。CEO 確認後に contact registry へ登録します。",
  ].join("\n");

  const questions = [
    ...(interpretation?.ceo_questions ?? []),
    `この送信者（${idEntry.sender_email}）は誰ですか？氏名・所属・関係性を教えてください。`,
    web?.hits.length
      ? "Web 検索結果は正しいですか？"
      : "この人物・組織について把握している情報はありますか？",
    "返信が必要か、期限はいつまでか教えてください。",
  ];

  return { subject, summary, questions };
}

function buildInlineFields(
  interpretation: MailInterpretationResult | undefined,
  entry: MailTriageEntry
): CeoInlineQuestion["fields"] {
  const fields: CeoInlineQuestion["fields"] = [];
  if (interpretation?.intent === "return_item") {
    fields.push(
      { id: "has_item", label: "返却対象のノート等は手元にありますか？", type: "yes_no_unknown" },
      { id: "can_return_date", label: "いつ返却できますか？", type: "text" },
      { id: "return_method", label: "返却方法・場所（来社・郵送・手渡し等）", type: "text" }
    );
  }
  if (interpretation?.intent === "schedule") {
    fields.push(
      { id: "schedule_ok", label: "案内された日程で問題ありませんか？", type: "yes_no" },
      { id: "schedule_note", label: "日程・場所の補足", type: "text" }
    );
  }
  if (!fields.length) {
    fields.push(
      { id: "reply_needed", label: "返信が必要ですか？", type: "yes_no" },
      { id: "note", label: "秘書への指示（任意）", type: "text" }
    );
  }
  if (interpretation && interpretation.agreement < 0.67) {
    fields.push({
      id: "interpret_confirm",
      label: `解釈確認: ${interpretation.summary_l1}`,
      type: "yes_no",
    });
  }
  if (entry.importance === "p0") {
    fields.push({ id: "p0_priority", label: "p0 対応 — 今日中の判断", type: "text" });
  }
  return fields;
}

export async function identifySenderForTriageEntry(
  entry: MailTriageEntry,
  opts: IdentifySenderOptions = {}
): Promise<IdentifySenderResult> {
  if (entry.disposition === "spam" || entry.routing === "ignore") {
    return { triage: entry, action: "skipped" };
  }

  const resolved = resolveMailSender(entry.from);
  const existingId = findSenderIdentification(entry.id);

  if (resolved.known) {
    const triage = upsertTriageEntry({
      ...entry,
      sender_email: resolved.email,
      sender_known: true,
      sender_contact_ref: resolved.contactRef,
      sender_scope: resolved.scope,
      identification_status: "not_needed",
    });
    if (existingId && existingId.status !== "registered") {
      upsertSenderIdentification({
        ...existingId,
        status: "not_needed",
        known_contact_ref: resolved.contactRef,
        known_scope:
          resolved.scope === "internal"
            ? "internal"
            : resolved.scope === "peer"
              ? "peer"
              : "external",
        internal_domain: resolved.internalDomain,
      });
    }
    return { triage, action: "known" };
  }

  if (existingId?.status === "registered" || existingId?.status === "ceo_confirmed") {
    return { triage: entry, identification: existingId, action: "skipped" };
  }

  let idEntry: SenderIdentificationEntry = existingId ?? {
    mail_id: entry.id,
    sender_email: resolved.email,
    sender_display_name: resolved.displayName,
    status: "pending_enrichment",
    internal_domain: resolved.internalDomain,
  };

  if (!opts.skipWebSearch && !idEntry.web_search && !opts.dryRun) {
    const search = await searchWebForSender({
      displayName: resolved.displayName,
      email: resolved.email,
    });
    idEntry = upsertSenderIdentification({
      ...idEntry,
      status: "pending_ceo",
      web_search: {
        queried_at: new Date().toISOString(),
        query: search.query,
        hits: search.hits,
        note: search.note,
      },
    });
  } else if (!idEntry.web_search) {
    idEntry = upsertSenderIdentification({
      ...idEntry,
      status: "pending_ceo",
    });
  }

  if (!opts.skipCeoAsk && !idEntry.ceo_question && !opts.dryRun) {
    const interpretation = await interpretMailFromTriageEntry(entry);
    const ceo = buildCeoQuestion(entry, idEntry, interpretation);

    if (isCeoInlineQuestionMode()) {
      const inline = askCeoInline({
        mailId: entry.id,
        subject: ceo.subject,
        contextL1: [
          interpretation?.summary_l1,
          interpretation?.who_lent && interpretation?.who_must_return
            ? `解釈（${Math.round((interpretation.agreement ?? 0) * 100)}% 一致）: 貸主=${interpretation.who_lent} · 返却義務=${interpretation.who_must_return}`
            : undefined,
          ceo.summary.slice(0, 600),
        ]
          .filter(Boolean)
          .join("\n"),
        fields: buildInlineFields(interpretation, entry),
      });
      idEntry = upsertSenderIdentification({
        ...idEntry,
        status: "pending_ceo",
        ceo_question: {
          asked_at: new Date().toISOString(),
          subject: ceo.subject,
          summary: `Today インライン質問 ${inline.id}`,
          escalate_path: `data/executive/ceo-inline-questions.yaml#${inline.id}`,
        },
      });
    } else {
      const consult = writeSecretaryConsultFile({
        subject: ceo.subject,
        background: ceo.summary,
        questions: ceo.questions,
        confidential: "L1",
        responseFormat: "氏名 · 所属 · 役職 · 関係性 · Web 検索の採用可否",
        memo: `mail_intake sender identification · ${entry.id}`,
      });
      idEntry = upsertSenderIdentification({
        ...idEntry,
        status: "pending_ceo",
        ceo_question: {
          asked_at: new Date().toISOString(),
          subject: ceo.subject,
          summary: ceo.summary.slice(0, 2000),
          escalate_path: consult.consultPath,
        },
      });
    }
  }

  const triage = upsertTriageEntry({
    ...entry,
    sender_email: resolved.email,
    sender_known: false,
    sender_scope: resolved.internalDomain ? "internal" : "external",
    identification_status: idEntry.status === "pending_ceo" ? "pending_ceo" : "pending_enrichment",
  });

  return {
    triage,
    identification: idEntry,
    action: idEntry.ceo_question ? "ceo_asked" : "enriched",
  };
}

export interface ConfirmSenderInput {
  mailId: string;
  name: string;
  org?: string;
  department?: string;
  role?: string;
  relationship?: string;
  notes?: string;
  webSearchTrusted?: boolean;
  confirmedBy?: string;
}

export function confirmSenderFromCeo(input: ConfirmSenderInput): SenderIdentificationEntry {
  const idEntry = findSenderIdentification(input.mailId);
  if (!idEntry) {
    throw new Error(`sender identification not found for mail ${input.mailId}`);
  }

  const updated = upsertSenderIdentification({
    ...idEntry,
    status: "ceo_confirmed",
    ceo_confirmed: {
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.confirmedBy,
      name: input.name,
      org: input.org,
      department: input.department,
      role: input.role,
      relationship: input.relationship,
      notes: input.notes,
      web_search_trusted: input.webSearchTrusted ?? false,
    },
  });

  const triage = findTriageEntry(input.mailId);
  if (triage) {
    upsertTriageEntry({
      ...triage,
      identification_status: "ceo_confirmed",
    });
  }

  return updated;
}

export function registerConfirmedSender(mailId: string): {
  identification: SenderIdentificationEntry;
  extId: string;
} {
  const idEntry = findSenderIdentification(mailId);
  if (!idEntry?.ceo_confirmed) {
    throw new Error(`CEO 確認済みデータがありません: ${mailId} — 先に confirm を実行`);
  }
  const c = idEntry.ceo_confirmed;

  const notesParts = [c.notes, idEntry.web_search?.note].filter(Boolean);
  if (idEntry.web_search?.hits.length && !c.web_search_trusted) {
    notesParts.push(
      `Web 検索参考（未採用）: ${idEntry.web_search.query} — ${idEntry.web_search.hits[0]?.snippet?.slice(0, 120) ?? ""}`
    );
  } else if (c.web_search_trusted && idEntry.web_search?.hits.length) {
    notesParts.push(`Web 検索採用: ${idEntry.web_search.query}`);
  }

  const reg = registerContact({
    name: c.name,
    email: idEntry.sender_email,
    org: c.org,
    department: c.department,
    role: c.role,
    relationship: c.relationship,
    notes: notesParts.join(" · ") || undefined,
    source: "mail_intake_enrichment",
  });

  const identification = upsertSenderIdentification({
    ...idEntry,
    status: "registered",
    registered_ext_id: reg.extId,
    registered_stakeholder_id: reg.contact.stakeholder_id,
  });

  const triage = findTriageEntry(mailId);
  if (triage) {
    upsertTriageEntry({
      ...triage,
      sender_known: true,
      sender_contact_ref: `data/executive/external-contacts.yaml#${reg.extId}`,
      sender_scope: "external",
      identification_status: "registered",
    });
  }

  return { identification, extId: reg.extId };
}

export function listSenderIdentificationPending(): SenderIdentificationEntry[] {
  return listPendingCeoIdentification();
}

export function formatSenderIdentificationReport(entry: SenderIdentificationEntry): string {
  const lines = [
    `Mail: ${entry.mail_id}`,
    `送信者: ${entry.sender_display_name ?? ""} <${entry.sender_email}>`,
    `状態: ${entry.status}`,
    `自社ドメイン: ${entry.internal_domain ? "はい" : "いいえ"}`,
  ];
  if (entry.known_contact_ref) lines.push(`既知参照: ${entry.known_contact_ref}`);
  if (entry.web_search) {
    lines.push("", formatWebSearchSummary(entry.web_search));
  }
  if (entry.ceo_question) {
    lines.push("", `CEO 質問: ${entry.ceo_question.subject}`);
    if (entry.ceo_question.escalate_path) lines.push(`CONSULT: ${entry.ceo_question.escalate_path}`);
  }
  if (entry.ceo_confirmed) {
    lines.push(
      "",
      `CEO 確認: ${entry.ceo_confirmed.name} · ${entry.ceo_confirmed.org ?? "—"} · ${entry.ceo_confirmed.role ?? "—"}`
    );
  }
  if (entry.registered_ext_id) lines.push(`登録: ${entry.registered_ext_id}`);
  return lines.join("\n");
}
