import type { BreachIncident } from "../../../../../../schemas/jp-data-breach.js";
import type { BreachAssessment } from "./assessment.js";
import {
  dayNumberDate,
  daysFromTo,
  holidayCalendarCoversYear,
  rollForwardToBusinessDay,
} from "./calendar.js";

/** 通則編GL 3-5-3-3 · 3-5-3-5 — 速報・委託元通知の「速やか」は概ね3〜5日以内（目安 · 法定期限ではない） */
export const PRELIMINARY_GUIDELINE_WARN_DAY = 3;
export const PRELIMINARY_GUIDELINE_LIMIT_DAY = 5;

/** 運用上の早期警告（法定ではない）— 確報期限の残日数がこれ以下で due_soon */
export const FINAL_REPORT_WARNING_DAYS = 7;

export type DeadlineStatus =
  "done" | "done_late" | "overdue" | "due_soon" | "pending" | "not_required";

export type DeadlineItemId = "preliminary" | "final" | "individual_notice" | "entrustor_notice";

export interface DeadlineItem {
  id: DeadlineItemId;
  label: string;
  basis: string;
  due_on: string | null;
  done_on: string | null;
  status: DeadlineStatus;
  guideline_only: boolean;
  notes: string[];
  needs_review: string[];
}

export interface IncidentDeadlines {
  incident_id: string;
  assessment_status: BreachAssessment["status"];
  obligation: BreachAssessment["obligation"];
  provisional: boolean;
  items: DeadlineItem[];
}

const ITEM_LABELS: Record<DeadlineItemId, { label: string; basis: string }> = {
  preliminary: { label: "速報", basis: "施行規則8条1項（知った後速やかに · GL目安 概ね3〜5日）" },
  final: { label: "確報", basis: "施行規則8条2項（知った日から30日以内 · 7条3号は60日以内）" },
  individual_notice: {
    label: "本人への通知",
    basis: "法26条2項 · 施行規則10条（状況に応じて速やかに）",
  },
  entrustor_notice: {
    label: "委託元への通知",
    basis: "法26条1項ただし書 · 施行規則9条（知った後速やかに）",
  },
};

export function preliminaryWindowStatus(
  knownOn: string,
  asOf: string,
  doneOn?: string
): DeadlineStatus {
  const warnOn = dayNumberDate(knownOn, PRELIMINARY_GUIDELINE_WARN_DAY);
  const limitOn = dayNumberDate(knownOn, PRELIMINARY_GUIDELINE_LIMIT_DAY);
  if (doneOn) return doneOn > limitOn ? "done_late" : "done";
  if (asOf > limitOn) return "overdue";
  return asOf >= warnOn ? "due_soon" : "pending";
}

export function finalReportDueDate(
  knownOn: string,
  days: number,
  holidays: ReadonlySet<string>
): string {
  return rollForwardToBusinessDay(dayNumberDate(knownOn, days), holidays);
}

export function finalReportStatus(dueOn: string, asOf: string, doneOn?: string): DeadlineStatus {
  if (doneOn) return doneOn > dueOn ? "done_late" : "done";
  if (asOf > dueOn) return "overdue";
  return daysFromTo(asOf, dueOn) <= FINAL_REPORT_WARNING_DAYS ? "due_soon" : "pending";
}

function baseItem(id: DeadlineItemId): Pick<DeadlineItem, "id" | "label" | "basis"> {
  return { id, ...ITEM_LABELS[id] };
}

function guidelineWindowItem(
  id: DeadlineItemId,
  knownOn: string,
  asOf: string,
  doneOn?: string
): DeadlineItem {
  const warnOn = dayNumberDate(knownOn, PRELIMINARY_GUIDELINE_WARN_DAY);
  const limitOn = dayNumberDate(knownOn, PRELIMINARY_GUIDELINE_LIMIT_DAY);
  return {
    ...baseItem(id),
    due_on: limitOn,
    done_on: doneOn ?? null,
    status: preliminaryWindowStatus(knownOn, asOf, doneOn),
    guideline_only: true,
    notes: [`GL目安: ${warnOn}（3日目）〜${limitOn}（5日目）· known_on を1日目として計算`],
    needs_review: [],
  };
}

function finalReportItem(
  incident: BreachIncident,
  assessment: BreachAssessment,
  asOf: string,
  holidays: ReadonlySet<string>
): DeadlineItem {
  const days = assessment.final_report_days ?? 0;
  const rawDue = dayNumberDate(incident.known_on, days);
  const dueOn = finalReportDueDate(incident.known_on, days, holidays);
  const doneOn = incident.reports.final_submitted_on;
  const uncoveredYears = [rawDue, dueOn]
    .map((d) => d.slice(0, 4))
    .filter((year) => !holidayCalendarCoversYear(year, holidays));
  return {
    ...baseItem("final"),
    due_on: dueOn,
    done_on: doneOn ?? null,
    status: finalReportStatus(dueOn, asOf, doneOn),
    guideline_only: false,
    notes: [`${days}日目 = ${rawDue}${rawDue === dueOn ? "" : ` → 休日のため ${dueOn}`}`],
    needs_review: [...new Set(uncoveredYears)].map(
      (year) => `祝日カレンダー（holidays.yaml）に ${year} 年がない — 期限日を人間確認`
    ),
  };
}

function individualNoticeItem(incident: BreachIncident): DeadlineItem {
  const doneOn =
    incident.individuals_notified_on ?? incident.notification_alternative?.implemented_on;
  return {
    ...baseItem("individual_notice"),
    due_on: null,
    done_on: doneOn ?? null,
    status: doneOn ? "done" : "pending",
    guideline_only: false,
    notes: ["法定の日数なし — 事案の状況に応じて速やかに（通則編GL 3-5-4-2）"],
    needs_review: [],
  };
}

function notRequiredItem(id: DeadlineItemId, reason: string): DeadlineItem {
  return {
    ...baseItem(id),
    due_on: null,
    done_on: null,
    status: "not_required",
    guideline_only: false,
    notes: [reason],
    needs_review: [],
  };
}

function reportingItems(
  incident: BreachIncident,
  assessment: BreachAssessment,
  asOf: string,
  holidays: ReadonlySet<string>
): DeadlineItem[] {
  const preliminaryDoneOn =
    incident.reports.preliminary_submitted_on ?? incident.reports.final_submitted_on;
  return [
    guidelineWindowItem("preliminary", incident.known_on, asOf, preliminaryDoneOn),
    finalReportItem(incident, assessment, asOf, holidays),
    individualNoticeItem(incident),
  ];
}

function resolveItems(
  incident: BreachIncident,
  assessment: BreachAssessment,
  asOf: string,
  holidays: ReadonlySet<string>
): DeadlineItem[] {
  if (assessment.obligation === "none") {
    const reason = "報告対象事態に該当しない判定（任意報告は可 · 通則編GL 3-5-3-1 ※1）";
    return (["preliminary", "final", "individual_notice"] as const).map((id) =>
      notRequiredItem(id, reason)
    );
  }
  if (assessment.obligation === "entrustee_exempt") {
    const reason = "委託元へ通知済 — 報告・本人通知義務は免除（法26条1項ただし書 · 2項括弧書）";
    return [
      guidelineWindowItem(
        "entrustor_notice",
        incident.known_on,
        asOf,
        incident.entrustor_notified_on
      ),
      ...(["preliminary", "final", "individual_notice"] as const).map((id) =>
        notRequiredItem(id, reason)
      ),
    ];
  }
  const entrustorItems =
    assessment.obligation === "entrustee_pending_notice"
      ? [guidelineWindowItem("entrustor_notice", incident.known_on, asOf)]
      : [];
  return [...entrustorItems, ...reportingItems(incident, assessment, asOf, holidays)];
}

/** 速報・確報・本人通知・委託元通知の期限状況（asOf を明示入力 · 純関数） */
export function computeIncidentDeadlines(
  incident: BreachIncident,
  assessment: BreachAssessment,
  asOf: string,
  holidays: ReadonlySet<string>
): IncidentDeadlines {
  return {
    incident_id: incident.id,
    assessment_status: assessment.status,
    obligation: assessment.obligation,
    provisional: assessment.provisional,
    items: resolveItems(incident, assessment, asOf, holidays),
  };
}
