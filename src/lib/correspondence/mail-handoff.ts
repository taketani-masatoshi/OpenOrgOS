import { mkdirSync, writeFileSync } from "node:fs";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import { pushNotifications } from "../notifications/push.js";
import { buildTodayContext } from "../steward-chat/today-context.js";
import { findTriageEntry, upsertTriageEntry } from "./mail-triage-queue.js";
import { inboundCorrespondenceDraftMdPath } from "./paths.js";
import { sendInboundSlackDigest } from "./slack-notify.js";
import { findSenderIdentification } from "./sender-identification-queue.js";
import { findMailInterpretation } from "./mail-interpretation.js";
import { findCeoInlineQuestionByMailId } from "./ceo-inline-question.js";
import { findSchedulingCase } from "../scheduling-coordination/store.js";
import { nextActionLabel } from "../scheduling-coordination/next-action.js";

export async function notifyMailTriageHighPriority(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const ctx = buildTodayContext();
  let notified = 0;

  for (const id of ids) {
    const entry = findTriageEntry(id);
    if (!entry) continue;
    try {
      await pushNotifications("mail_triage_high", ctx);
      upsertTriageEntry({
        ...entry,
        notified_at: new Date().toISOString(),
      });
      notified += 1;
    } catch {
      // notification channel optional
    }
  }

  try {
    await sendInboundSlackDigest(ids);
  } catch {
    // slack optional
  }

  return notified;
}

function formatSenderSection(mailId: string): string[] {
  const id = findSenderIdentification(mailId);
  if (!id) return ["（未実施）"];
  const lines = [
    `- 状態: **${id.status}**`,
    `- 送信者: ${id.sender_display_name ?? ""} <${id.sender_email}>`,
  ];
  if (id.known_contact_ref) lines.push(`- 既知参照: ${id.known_contact_ref}`);
  if (id.ceo_question?.subject) lines.push(`- CEO 質問: ${id.ceo_question.subject}`);
  if (id.ceo_confirmed) {
    lines.push(
      `- CEO 確認: ${id.ceo_confirmed.name}${id.ceo_confirmed.org ? ` · ${id.ceo_confirmed.org}` : ""}`
    );
  }
  return lines;
}

function formatInterpretationSection(mailId: string): string[] {
  const interp = findMailInterpretation(mailId);
  if (!interp) return ["（未解釈）"];
  return [
    `- intent: **${interp.intent}** · agreement: ${Math.round(interp.agreement * 100)}%`,
    `- 要約: ${interp.summary_l1}`,
    interp.who_lent ? `- 貸主: ${interp.who_lent} · 返却義務: ${interp.who_must_return ?? "—"}` : "",
    interp.dissent_notes.length ? `- 不一致: ${interp.dissent_notes.join("; ")}` : "",
    interp.action_required ? "- 対応要: はい" : "- 対応要: いいえ",
  ].filter(Boolean);
}

function formatCeoInlineSection(mailId: string): string[] {
  const q = findCeoInlineQuestionByMailId(mailId);
  if (!q) return ["（なし）"];
  const lines = [`- ${q.id} · **${q.status}** · ${q.subject}`];
  for (const f of q.fields) {
    const ans = q.answers?.[f.id];
    lines.push(`  - ${f.label}${ans ? `: ${ans}` : ""}`);
  }
  return lines;
}

function formatSchedulingSection(entry: MailTriageEntry): string[] {
  if (!entry.scheduling_case_id) {
    const interp = findMailInterpretation(entry.id);
    if (interp?.intent === "schedule") {
      return ["- intent: schedule · **案件未紐付け**"];
    }
    return ["（該当なし）"];
  }
  const sch = findSchedulingCase(entry.scheduling_case_id);
  if (!sch) return [`- case: ${entry.scheduling_case_id}（未找到）`];
  return [
    `- case: **${sch.id}** · ${sch.title}`,
    `- status: ${sch.status} · next: ${nextActionLabel(sch.next_action)}`,
    entry.schedule_reply_parsed ? "- 返信パース: 済" : "- 返信パース: 未",
  ];
}

function formatRecommendedActions(entry: MailTriageEntry): string[] {
  const actions: string[] = [];
  const interp = findMailInterpretation(entry.id);
  const sender = findSenderIdentification(entry.id);
  const ceoQ = findCeoInlineQuestionByMailId(entry.id);

  if (!entry.sender_known && sender?.status === "pending_ceo") {
    actions.push("CEO が送信者を確認後、`mail intake sender register` を検討");
  }
  if (ceoQ?.status === "pending") {
    actions.push(`CEO インライン質問 ${ceoQ.id} への回答を検討`);
  }
  if (interp?.action_required && entry.routing === "secretary") {
    actions.push("秘書が返信下書きの作成を検討");
  }
  if (entry.scheduling_case_id) {
    const sch = findSchedulingCase(entry.scheduling_case_id);
    if (sch) {
      actions.push(
        `日程調整案件 ${sch.id} · 次: ${nextActionLabel(sch.next_action)} · \`orgos executive scheduling draft --id ${sch.id} --write-draft\``
      );
    }
  } else if (interp?.intent === "schedule") {
    actions.push(
      "日程意図 — 既存案件へ `orgos executive scheduling link-mail` または `executive scheduling process --all`"
    );
  }
  if (entry.importance === "p0" || entry.urgency === "immediate") {
    actions.push("高優先度 — 当日対応の検討");
  }
  if (!actions.length) {
    actions.push("現時点で自動推奨アクションなし — トリアージ結果を参照");
  }
  return actions.map((a) => `- ${a}`);
}

export function formatInboundHandoffMarkdown(entry: MailTriageEntry): string {
  return [
    `# Inbound Mail — ${entry.id}`,
    "",
    `**From:** ${entry.from}`,
    `**Subject:** ${entry.subject}`,
    `**Received:** ${entry.received_at}`,
    "",
    "## Triage",
    "",
    `- Importance: **${entry.importance}**`,
    `- Urgency: **${entry.urgency}**`,
    `- Disposition: **${entry.disposition}**`,
    `- Routing: **${entry.routing}**`,
    entry.sender_known ? `- Sender known: yes` : `- Sender known: no`,
    entry.rule_hits.length ? `- Rules: ${entry.rule_hits.join(", ")}` : "",
    "",
    "## Sender identification",
    "",
    ...formatSenderSection(entry.id),
    "",
    "## Interpretation ensemble",
    "",
    ...formatInterpretationSection(entry.id),
    "",
    "## CEO inline questions",
    "",
    ...formatCeoInlineSection(entry.id),
    "",
    "## Scheduling coordination",
    "",
    ...formatSchedulingSection(entry),
    "",
    "## Recommended actions",
    "",
    ...formatRecommendedActions(entry),
    "",
    "## Secretary action",
    "",
    "返信が必要な場合は **Mail Outbound** が `correspondence_draft` / `external_correspondence` で送信下書きを作成。",
    "本文は L2: `" + entry.eml_ref + "` を @file 参照。",
    "",
    `Handoff status: ${entry.handoff_status}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function writeInboundHandoffDraft(entry: MailTriageEntry): string {
  const path = inboundCorrespondenceDraftMdPath(entry.id);
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, formatInboundHandoffMarkdown(entry), "utf-8");
  return path;
}
