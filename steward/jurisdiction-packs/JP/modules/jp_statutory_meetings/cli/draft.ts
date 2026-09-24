import type {
  GovernanceSettingsFile,
  ResolutionType,
  StatutoryMeetingsSourcesFile,
  StatutoryResolution,
} from "../../../../../../schemas/jp-statutory-meetings.js";
import { noticePeriodFor, type MeetingContext } from "./checklist.js";
import {
  evaluateResolution,
  latestDispatchDate,
  minutesItemSet,
  minutesRetentionPlan,
  recordDateWindow,
  type MeetingBody,
} from "./rules.js";

/** 和文書式の字下げ（全角スペース） */
const INDENT = "\u3000";

/** 令和元年 = 2019年 */
const REIWA_EPOCH_OFFSET = 2018;

export interface DraftDocumentSpec {
  templateId: string;
  outputName: string;
}

const DRAFT_DOCUMENTS: Record<MeetingBody, Record<MeetingContext["statutory"]["mode"], DraftDocumentSpec[]>> = {
  shareholders: {
    convened: [
      { templateId: "shareholders-notice", outputName: "shoshu-tsuchi.md" },
      { templateId: "shareholders-minutes", outputName: "gijiroku.md" },
    ],
    written_resolution: [
      { templateId: "written-proposal", outputName: "teian-sho.md" },
      { templateId: "deemed-minutes", outputName: "gijiroku.md" },
    ],
  },
  board: {
    convened: [
      { templateId: "board-notice", outputName: "shoshu-tsuchi.md" },
      { templateId: "board-minutes", outputName: "gijiroku.md" },
    ],
    written_resolution: [
      { templateId: "written-proposal", outputName: "teian-sho.md" },
      { templateId: "deemed-minutes", outputName: "gijiroku.md" },
    ],
  },
};

const APPROVAL_PHRASES: Record<ResolutionType, string> = {
  ordinary: "出席株主の議決権の過半数の賛成",
  director_election: "出席株主の議決権の過半数の賛成",
  special: "出席株主の議決権の3分の2以上の賛成",
  special_309_3: "議決権を行使することができる株主の半数以上であって、当該株主の議決権の3分の2以上の賛成",
  special_309_4: "総株主の半数以上であって、総株主の議決権の4分の3以上の賛成",
  board: "出席取締役の過半数の賛成",
};

const BODY_LABELS: Record<MeetingBody, string> = { shareholders: "株主総会", board: "取締役会" };
const OMISSION_ARTICLES: Record<MeetingBody, string> = { shareholders: "会社法319条1項", board: "会社法370条" };
const CONSENT_PARTIES: Record<MeetingBody, string> = { shareholders: "株主", board: "取締役" };

export function draftDocumentsFor(body: MeetingBody, mode: MeetingContext["statutory"]["mode"]): DraftDocumentSpec[] {
  return DRAFT_DOCUMENTS[body][mode];
}

export function toReiwaDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `令和${year - REIWA_EPOCH_OFFSET}年${month}月${day}日`;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((out, [key, value]) => out.replaceAll(`{{${key}}}`, value), template);
}

export function officerName(settings: GovernanceSettingsFile, stakeholderId: string | undefined): string {
  if (!stakeholderId) return "（要記載）";
  const officer = settings.officers.find((o) => o.stakeholder_id === stakeholderId);
  return officer?.display_name ?? `［氏名: ${stakeholderId}］`;
}

function representativeName(settings: GovernanceSettingsFile): string {
  const representative = settings.officers.find((o) => o.role === "representative_director");
  return officerName(settings, representative?.stakeholder_id);
}

function agendaBlock(resolutions: StatutoryResolution[]): string {
  if (!resolutions.length) return `${INDENT}（議題を記載）`;
  return resolutions.map((r, index) => `${INDENT}第${index + 1}号議案${INDENT}${r.agenda}`).join("\n");
}

function resolutionOutcomeSentence(ctx: MeetingContext, resolution: StatutoryResolution): string {
  const evaluation = evaluateResolution(resolution, ctx.settings.articles);
  if (resolution.outcome_recorded === "rejected") return `${INDENT}採決の結果、否決された。`;
  if (evaluation.requirement_met !== true) return `${INDENT}（採決結果を記載 · 決議要件の充足を人間が確認）`;
  return `${INDENT}議長が本議案を諮ったところ、${APPROVAL_PHRASES[resolution.type]}により、原案どおり承認可決された。`;
}

function resolutionsBlock(ctx: MeetingContext): string {
  const { resolutions } = ctx.statutory;
  if (!resolutions.length) return `${INDENT}（議事の経過の要領及びその結果を記載）`;
  return resolutions
    .map((r, index) => [`第${index + 1}号議案${INDENT}${r.agenda}`, resolutionOutcomeSentence(ctx, r)].join("\n"))
    .join("\n\n");
}

function votingStatusBlock(ctx: MeetingContext): string {
  const votes = ctx.statutory.resolutions.find((r) => r.votes?.voting_rights_total !== undefined)?.votes;
  if (ctx.body !== "shareholders" || !votes) return `${INDENT}（議決権の状況を記載）`;
  return [
    `${INDENT}議決権を行使することができる株主の議決権の数${INDENT}${votes.voting_rights_total ?? "—"} 個`,
    `${INDENT}出席株主の議決権の数${INDENT}${votes.voting_rights_present ?? "—"} 個`,
  ].join("\n");
}

function attendeesBlock(ctx: MeetingContext): string {
  const names = ctx.statutory.attendee_stakeholder_ids.map((id) => officerName(ctx.settings, id));
  return names.length ? names.join("、") : "（要記載）";
}

function signaturesBlock(ctx: MeetingContext): string {
  const ids = ctx.statutory.attendee_stakeholder_ids;
  if (!ids.length) return "（出席取締役・監査役の署名又は記名押印欄）";
  return ids.map((id) => `${officerName(ctx.settings, id)}${INDENT}＿＿＿＿＿＿＿＿＿＿`).join("\n");
}

function noticeVars(ctx: MeetingContext): Record<string, string> {
  if (ctx.statutory.mode === "written_resolution") {
    return { latest_dispatch_date: "—", notice_date_reiwa: "—", notice_basis: "—", notice_method_note: "—" };
  }
  const period = noticePeriodFor(ctx);
  const deadline = latestDispatchDate(ctx.meetingDate, period.days);
  return {
    latest_dispatch_date: deadline,
    notice_date_reiwa: toReiwaDate(ctx.statutory.notice_sent_on ?? deadline),
    notice_basis: period.basis,
    notice_method_note: period.writtenRequired ? "書面（又は株主の承諾を得た電磁的方法）" : "方法の定めなし（記録が残る方法を推奨）",
  };
}

function recordDateNote(ctx: MeetingContext): string {
  const recordDate = ctx.statutory.record_date;
  if (!recordDate) return "基準日なし";
  const window = recordDateWindow(recordDate, ctx.meetingDate, ctx.statutory.record_date_in_articles);
  return `${recordDate}（権利行使期限 ${window.window_end} · 会社法124条2項）`;
}

function remoteVotingParagraph(ctx: MeetingContext): string {
  if (!ctx.statutory.written_voting && !ctx.statutory.electronic_voting) {
    return "なお、当日ご出席願えない場合は、委任状により議決権を行使することができます。";
  }
  return "なお、当日ご出席願えない場合は、書面又は電磁的方法により議決権を行使することができますので、株主総会参考書類をご検討のうえ行使してください。";
}

function retentionNote(ctx: MeetingContext): string {
  const plan = minutesRetentionPlan(ctx.body, ctx.meetingDate, ctx.settings.company_profile, ctx.statutory.minutes);
  const branch = plan.branch_copy_required ? ` · 支店に写しを ${plan.branch_copy_until} まで` : "";
  return `本店に ${plan.head_office_until} まで${branch}`;
}

function sourceUrl(sources: StatutoryMeetingsSourcesFile | null, id: string): string {
  return sources?.sources.find((s) => s.id === id)?.url ?? "https://laws.e-gov.go.jp/";
}

export interface CompanyIdentity {
  name: string;
  address?: string;
}

export function buildDraftVars(
  ctx: MeetingContext,
  company: CompanyIdentity,
  sources: StatutoryMeetingsSourcesFile | null
): Record<string, string> {
  const { statutory, settings } = ctx;
  const firstProposer = statutory.resolutions.find((r) => r.proposer_stakeholder_id)?.proposer_stakeholder_id;
  return {
    ...noticeVars(ctx),
    meeting_id: ctx.meetingId,
    meeting_title: statutory.title,
    company_name: company.name,
    head_office: company.address ?? "（本店所在地 · company.yaml を確認）",
    representative_name: representativeName(settings),
    meeting_date_reiwa: toReiwaDate(ctx.meetingDate),
    start_time: statutory.start_time ?? "（時刻を記載）",
    place: statutory.place ?? "（場所を記載）",
    agenda_block: agendaBlock(statutory.resolutions),
    resolutions_block: resolutionsBlock(ctx),
    voting_status_block: votingStatusBlock(ctx),
    attending_block: attendeesBlock(ctx),
    signatures_block: signaturesBlock(ctx),
    chair_name: officerName(settings, statutory.minutes?.chair_stakeholder_id),
    author_name: officerName(settings, statutory.minutes?.author_stakeholder_id),
    proposer_name: officerName(settings, firstProposer),
    record_date_note: recordDateNote(ctx),
    remote_voting_paragraph: remoteVotingParagraph(ctx),
    body_label: BODY_LABELS[ctx.body],
    omission_article: OMISSION_ARTICLES[ctx.body],
    consent_party_label: CONSENT_PARTIES[ctx.body],
    deemed_date_reiwa: toReiwaDate(statutory.written_consent?.completed_on ?? ctx.meetingDate),
    minutes_basis: minutesItemSet(ctx.body, statutory.mode).basis,
    retention_note: retentionNote(ctx),
    source_companies_act_url: sourceUrl(sources, "egov-companies-act"),
    source_regulation_url: sourceUrl(sources, "egov-companies-act-regulation"),
  };
}
