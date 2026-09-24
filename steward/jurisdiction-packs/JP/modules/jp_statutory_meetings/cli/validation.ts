import type {
  GovernanceSettingsFile,
  StatutoryMeeting,
  StatutoryMeetingsFile,
  StatutoryMeetingsSourcesFile,
  StatutoryRatio,
  StatutoryResolution,
} from "../../../../../../schemas/jp-statutory-meetings.js";
import type { GovernanceMeetingsFile } from "../../../../../../src/lib/extension-sot.js";
import {
  isRatioBelowMinimum,
  minutesItemSet,
  MIN_ARTICLES_QUORUM,
  NON_PUBLIC_NOTICE_DAYS,
  resolveMeetingBody,
  type MeetingBody,
} from "./rules.js";

export interface StatutoryMeetingsBundle {
  meetings: GovernanceMeetingsFile | null;
  statutory: StatutoryMeetingsFile | null;
  settings: GovernanceSettingsFile | null;
  sources: StatutoryMeetingsSourcesFile | null;
  dataSource: "tenant" | "seed";
}

const WHOLE: StatutoryRatio = { numerator: 1, denominator: 1 };

function missingFileIssues(bundle: StatutoryMeetingsBundle): string[] {
  const files: Array<[string, unknown]> = [
    ["meetings.yaml", bundle.meetings],
    ["statutory-meetings.yaml", bundle.statutory],
    ["governance-settings.yaml", bundle.settings],
    ["sources.yaml", bundle.sources],
  ];
  return files.filter(([, loaded]) => !loaded).map(([name]) => `${name} missing`);
}

function ratioIssues(label: string, ratio: StatutoryRatio | undefined): string[] {
  if (!ratio) return [];
  if (isRatioBelowMinimum(ratio, MIN_ARTICLES_QUORUM)) return [`articles.${label} below statutory minimum 1/3`];
  if (isRatioBelowMinimum(WHOLE, ratio)) return [`articles.${label} exceeds 1`];
  return [];
}

function settingsIssues(settings: GovernanceSettingsFile): string[] {
  const { company_profile: profile, articles } = settings;
  const issues = [...ratioIssues("special_quorum", articles.special_quorum), ...ratioIssues("election_quorum", articles.election_quorum)];
  const shortened = articles.shareholders_notice_days;
  if (shortened !== undefined && (profile.is_public_company || profile.has_board)) {
    issues.push("articles.shareholders_notice_days applies only to non-public companies without a board (会社法299条1項)");
  }
  if (shortened !== undefined && shortened >= NON_PUBLIC_NOTICE_DAYS) {
    issues.push("articles.shareholders_notice_days must be shorter than 7 days to have effect");
  }
  if (articles.allow_board_written_resolution && !profile.has_board) {
    issues.push("articles.allow_board_written_resolution requires has_board (会社法370条)");
  }
  return issues;
}

function voteIssues(meetingId: string, resolution: StatutoryResolution): string[] {
  const v = resolution.votes;
  if (!v) return [];
  const pairs: Array<[number | undefined, number | undefined, string]> = [
    [v.voting_rights_for, v.voting_rights_present, "voting_rights_for > voting_rights_present"],
    [v.voting_rights_present, v.voting_rights_total, "voting_rights_present > voting_rights_total"],
    [v.shareholders_for, v.shareholders_total, "shareholders_for > shareholders_total"],
    [v.directors_for, v.directors_present, "directors_for > directors_present"],
    [v.directors_present, v.directors_eligible, "directors_present > directors_eligible"],
  ];
  return pairs
    .filter(([part, whole]) => part !== undefined && whole !== undefined && part > whole)
    .map(([, , message]) => `${meetingId}/${resolution.id}: ${message}`);
}

function resolutionIssues(meetingId: string, body: MeetingBody, resolutions: StatutoryResolution[]): string[] {
  return resolutions.flatMap((resolution) => {
    const typeMatches = (resolution.type === "board") === (body === "board");
    const typeIssue = typeMatches ? [] : [`${meetingId}/${resolution.id}: type ${resolution.type} not valid for ${body}`];
    return [...typeIssue, ...voteIssues(meetingId, resolution)];
  });
}

function minutesIssues(meeting: StatutoryMeeting, body: MeetingBody, settings: GovernanceSettingsFile): string[] {
  const minutes = meeting.minutes;
  if (!minutes) return [];
  const itemSet = minutesItemSet(body, meeting.mode);
  const known = new Set([...itemSet.required, ...itemSet.conditional]);
  const unknownRecorded = minutes.recorded_items.filter((item) => !known.has(item));
  const unknownConditional = (minutes.conditional_items_applicable ?? []).filter((item) => !itemSet.conditional.includes(item));
  const officerIds = new Set(settings.officers.map((o) => o.stakeholder_id));
  const unknownOfficers = [minutes.author_stakeholder_id, minutes.chair_stakeholder_id].filter(
    (id): id is string => id !== undefined && !officerIds.has(id)
  );
  return [
    ...unknownRecorded.map((item) => `${meeting.meeting_id}: unknown minutes item ${item}`),
    ...unknownConditional.map((item) => `${meeting.meeting_id}: ${item} is not a conditional item for ${body}/${meeting.mode}`),
    ...unknownOfficers.map((id) => `${meeting.meeting_id}: officer ${id} not in governance-settings officers`),
  ];
}

function consentIssues(meeting: StatutoryMeeting): string[] {
  const records = [
    ["convocation_omission", meeting.convocation_omission],
    ["written_consent", meeting.written_consent],
  ] as const;
  return records
    .filter(([, record]) => record !== undefined && record.consented > record.eligible)
    .map(([name]) => `${meeting.meeting_id}: ${name}.consented > eligible`);
}

function meetingIssues(meeting: StatutoryMeeting, kind: string | undefined, settings: GovernanceSettingsFile): string[] {
  if (kind === undefined) return [`${meeting.meeting_id}: not found in meetings.yaml`];
  const body = resolveMeetingBody(kind);
  if (!body) return [`${meeting.meeting_id}: unsupported kind "${kind}" (shareholders | board)`];
  const issues: string[] = [];
  if (body === "shareholders" && !meeting.session) issues.push(`${meeting.meeting_id}: session (annual | extraordinary) required`);
  if (body === "board" && meeting.session) issues.push(`${meeting.meeting_id}: session applies only to shareholders meetings`);
  if (meeting.mode === "written_resolution" && !meeting.written_consent) {
    issues.push(`${meeting.meeting_id}: written_resolution requires written_consent`);
  }
  return [
    ...issues,
    ...resolutionIssues(meeting.meeting_id, body, meeting.resolutions),
    ...minutesIssues(meeting, body, settings),
    ...consentIssues(meeting),
  ];
}

function duplicateIssues(meetings: StatutoryMeeting[]): string[] {
  const seen = new Set<string>();
  return meetings.flatMap((m) => {
    if (seen.has(m.meeting_id)) return [`duplicate statutory entry ${m.meeting_id}`];
    seen.add(m.meeting_id);
    return [];
  });
}

function templateIssues(sources: StatutoryMeetingsSourcesFile, templateExists: (rel: string) => boolean): string[] {
  return sources.templates.filter((t) => !templateExists(t.template)).map((t) => `template ${t.id} missing (${t.template})`);
}

export function collectValidationIssues(
  bundle: StatutoryMeetingsBundle,
  templateExists: (rel: string) => boolean
): string[] {
  const issues = missingFileIssues(bundle);
  if (bundle.sources) issues.push(...templateIssues(bundle.sources, templateExists));
  if (!bundle.meetings || !bundle.statutory || !bundle.settings) return issues;
  const settings = bundle.settings;
  const kinds = new Map(bundle.meetings.meetings.map((m) => [m.id, m.kind]));
  issues.push(...settingsIssues(settings), ...duplicateIssues(bundle.statutory.meetings));
  for (const meeting of bundle.statutory.meetings) {
    issues.push(...meetingIssues(meeting, kinds.get(meeting.meeting_id), settings));
  }
  return issues;
}
