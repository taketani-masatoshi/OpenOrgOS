import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import { askCeoInline } from "./ceo-inline-question.js";
import { findMailInterpretation, interpretMailFromTriageEntry } from "./mail-interpretation.js";
import type { MailInterpretationResult } from "../../../schemas/correspondence/mail-interpretation.js";

function buildInterpretCeoFields(
  interpretation: MailInterpretationResult,
  entry: MailTriageEntry
): CeoInlineQuestion["fields"] {
  const fields: CeoInlineQuestion["fields"] = [];
  if (interpretation.intent === "return_item") {
    fields.push(
      { id: "has_item", label: "返却対象は手元にありますか？", type: "yes_no_unknown" },
      { id: "can_return_date", label: "いつ返却できますか？", type: "text" }
    );
  }
  if (interpretation.intent === "schedule") {
    fields.push(
      { id: "schedule_ok", label: "案内された日程で問題ありませんか？", type: "yes_no" },
      { id: "schedule_note", label: "日程・場所の補足", type: "text" }
    );
  }
  fields.push({
    id: "interpret_confirm",
    label: `解釈確認: ${interpretation.summary_l1}`,
    type: "yes_no",
  });
  if (entry.importance === "p0") {
    fields.push({ id: "p0_priority", label: "p0 対応 — 今日中の判断", type: "text" });
  }
  if (!fields.some((f) => f.id === "reply_needed")) {
    fields.unshift({ id: "reply_needed", label: "返信が必要ですか？", type: "yes_no" });
  }
  return fields;
}

function shouldInterpretEntry(entry: MailTriageEntry): boolean {
  if (!entry.sender_known) return false;
  if (entry.disposition === "spam" || entry.routing === "ignore") return false;
  return entry.importance === "p0" || entry.importance === "p1" || entry.routing === "secretary";
}

/** 既知送信者の p0/p1/secretary エントリを解釈し、低一致時は CEO インライン質問 */
export async function postTriageInterpretAndCeoAsk(
  entry: MailTriageEntry
): Promise<MailTriageEntry> {
  if (!shouldInterpretEntry(entry)) return entry;

  const interpretation =
    findMailInterpretation(entry.id) ?? (await interpretMailFromTriageEntry(entry));
  if (!interpretation) return entry;

  if (interpretation.agreement < 0.67 || interpretation.needs_ceo_confirm) {
    askCeoInline({
      mailId: entry.id,
      subject: `解釈確認: ${entry.subject}`,
      contextL1: [
        interpretation.summary_l1,
        `一致率 ${Math.round(interpretation.agreement * 100)}%`,
        interpretation.dissent_notes.length
          ? `不一致: ${interpretation.dissent_notes.join("; ")}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      fields: buildInterpretCeoFields(interpretation, entry),
    });
  }

  return entry;
}
