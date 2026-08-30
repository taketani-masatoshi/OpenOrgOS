import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { findPendingApprovalForCase } from "./ceo-confirm.js";
import { findUnanimousAcceptedSlot } from "./slots.js";
import { hasUnsentSchedulingDraft } from "./today-attention.js";
import { SCHEDULE_VENUE_RESERVATION_PENDING } from "./venue-gate.js";

function pendingNames(caseRow: SchedulingCase): string {
  return caseRow.participants
    .filter((p) => p.response === "pending")
    .map((p) => p.name)
    .join("、");
}

function confirmSlotLabel(caseRow: SchedulingCase): string | undefined {
  const slot =
    findUnanimousAcceptedSlot(caseRow.participants, caseRow.proposed_slots) ??
    caseRow.proposed_slots.find((s) => s.id === caseRow.pending_slot_id) ??
    caseRow.proposed_slots[0];
  return slot?.label ?? slot?.start;
}

export function buildSchedulingTodayItem(caseRow: SchedulingCase): {
  headline: string;
  detail: string;
  approval_id?: string;
  ceo_question_id?: string;
  visible_to_ceo: boolean;
} {
  const pending = caseRow.participants.filter((p) => p.response === "pending").length;
  const approvalId = findPendingApprovalForCase(caseRow.id);

  switch (caseRow.next_action) {
    case "send_proposal":
      return {
        headline: `【要承認】${caseRow.title} — 候補日時の送付`,
        detail: `参加者 ${caseRow.participants.length} 名 · 候補 ${caseRow.proposed_slots.length} 件`,
        approval_id: approvalId,
        visible_to_ceo: Boolean(approvalId),
      };
    case "send_reminder": {
      const names = pendingNames(caseRow);
      return {
        headline: `【要承認】${caseRow.title} — 未回答者へのリマインド`,
        detail: names
          ? `未回答 ${pending} 名（${names}）`
          : `未回答 ${pending} 名`,
        approval_id: approvalId,
        visible_to_ceo: Boolean(approvalId),
      };
    }
    case "send_confirmation":
      return {
        headline: `【要承認】${caseRow.title} — 確定通知の送付`,
        detail: `${confirmSlotLabel(caseRow) ?? "確定日時"} · 外部参加者別の通知`,
        approval_id: approvalId,
        visible_to_ceo: Boolean(approvalId),
      };
    case "ceo_confirm": {
      const slot = confirmSlotLabel(caseRow);
      const headline =
        caseRow.exception_reason === "schedule_split_accept"
          ? `【要判断】${caseRow.title} — 候補が分かれています`
          : caseRow.exception_reason === "schedule_counter_limit"
            ? `【要判断】${caseRow.title} — 再調整上限`
            : `【要判断】${caseRow.title} — 日程確定のご確認`;
      const detail =
        caseRow.exception_reason === "schedule_split_accept"
          ? "参加者の回答が複数候補に分かれています · 1つ選択"
          : caseRow.exception_reason === "schedule_counter_limit"
            ? "counter 3回 · 手動調整か中止"
            : slot
              ? `候補: ${slot} · 1つ選択で確定・通知`
              : "候補日時を確認してください";
      return {
        headline,
        detail,
        ceo_question_id: caseRow.ceo_question_id,
        visible_to_ceo: Boolean(caseRow.ceo_question_id),
      };
    }
    case "propose_slots":
      return {
        headline: `${caseRow.title} — 候補日時の再生成が必要`,
        detail:
          caseRow.counter_round > 0
            ? `代替日程の提案を受領（${caseRow.counter_round} 回目）`
            : "カレンダー空きから候補を作成します",
        visible_to_ceo: false,
      };
    case "write_calendar":
      return {
        headline:
          caseRow.calendar_sync === "failed"
            ? `【要再試行】${caseRow.title} — カレンダー同期失敗`
            : `${caseRow.title} — カレンダー反映待ち`,
        detail:
          caseRow.calendar_sync === "failed"
            ? "同期を再試行してください。未送信のため案件は閉じていません"
            : confirmSlotLabel(caseRow) ?? "確定日時を反映します",
        visible_to_ceo: caseRow.calendar_sync === "failed",
      };
    default:
      if (caseRow.exception_reason === SCHEDULE_VENUE_RESERVATION_PENDING) {
        return {
          headline: `${caseRow.title} — 会場の予約番号待ち`,
          detail: `${caseRow.location ?? "会場"} · 予約番号を登録すると確定通知に進みます`,
          visible_to_ceo: true,
        };
      }
      if (hasUnsentSchedulingDraft(caseRow)) {
        return {
          headline: `${caseRow.title} — 未送信の下書きがあります`,
          detail: "承認・送信が止まっています",
          approval_id: approvalId,
          visible_to_ceo: true,
        };
      }
      return {
        headline: caseRow.title,
        detail: `状態: ${caseRow.status}`,
        visible_to_ceo: false,
      };
  }
}
