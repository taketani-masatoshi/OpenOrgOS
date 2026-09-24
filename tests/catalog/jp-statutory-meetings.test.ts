// @catalog-ids: jp_statutory_meetings
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ArticlesOfIncorporationRules,
  CompanyGovernanceProfile,
  MinutesRecord,
  StatutoryMeeting,
  StatutoryResolution,
} from "../../schemas/jp-statutory-meetings.js";
import { statutoryMeetingSchema } from "../../schemas/jp-statutory-meetings.js";
import { listModuleCliBundles } from "../../src/lib/module-cli.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { getSkillById, validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import { jp_statutory_meetingsCli } from "../../steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/cli/register.js";
import {
  boardOmissionPaths,
  checkMandatoryWrittenVoting,
  checkMinutesItems,
  checkNoticeTiming,
  evaluateResolution,
  latestDispatchDate,
  meetsThreshold,
  minutesItemSet,
  minutesRetentionPlan,
  periodEndAfterMonths,
  recordDateWindow,
  resolveBoardNoticePeriod,
  resolveShareholderNoticePeriod,
  runJpStatutoryMeetingsChecklist,
  runJpStatutoryMeetingsDraft,
  runJpStatutoryMeetingsSchedule,
  runJpStatutoryMeetingsShow,
  runJpStatutoryMeetingsValidate,
  shareholderOmissionPaths,
  MAJORITY,
  MIN_ARTICLES_QUORUM,
  THREE_QUARTERS,
  TWO_THIRDS,
  type CheckItem,
} from "../../steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_statutory_meetings";

const NON_PUBLIC_WITH_BOARD: CompanyGovernanceProfile = {
  is_public_company: false,
  has_board: true,
  has_auditor: true,
  has_branches: true,
  uses_electronic_provision: false,
};
const NO_ARTICLES: ArticlesOfIncorporationRules = {
  allow_board_written_resolution: false,
  ordinary_quorum_excluded: false,
  heightened_requirements: false,
};
const NO_REMOTE_VOTING = { written_voting: false, electronic_voting: false };

function meeting(overrides: Partial<StatutoryMeeting> = {}): StatutoryMeeting {
  return statutoryMeetingSchema.parse({ meeting_id: "T-1", title: "test", ...overrides });
}

function resolution(overrides: Partial<StatutoryResolution>): StatutoryResolution {
  return { id: "R1", agenda: "test", type: "ordinary", ...overrides };
}

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as T;
}

function findCheck(checks: CheckItem[], id: string): CheckItem | undefined {
  return checks.find((check) => check.id === id);
}

describeCatalogModule(MODULE_ID);

describe("jp_statutory_meetings — convocation deadlines (会社法299条・368条 · 民法140条)", () => {
  it("counts clear days between dispatch and meeting (中14日 / 中7日)", () => {
    expect(latestDispatchDate("2026-06-29", 14)).toBe("2026-06-14");
    expect(latestDispatchDate("2026-06-26", 7)).toBe("2026-06-18");
  });

  it("flags notice one day after the deadline, accepts on / before", () => {
    const period = resolveShareholderNoticePeriod(NON_PUBLIC_WITH_BOARD, NO_ARTICLES, NO_REMOTE_VOTING);
    const at = (noticeSentOn: string) =>
      checkNoticeTiming({ meetingDate: "2026-06-26", period, noticeSentOn, asOf: "2026-09-24" }).status;
    expect(at("2026-06-17")).toBe("ok");
    expect(at("2026-06-18")).toBe("ok");
    expect(at("2026-06-19")).toBe("issue");
  });

  it("unsent notice is needs_review before the deadline and issue after it", () => {
    const period = resolveBoardNoticePeriod(NO_ARTICLES);
    const at = (asOf: string) =>
      checkNoticeTiming({ meetingDate: "2026-10-15", period, noticeSentOn: undefined, asOf }).status;
    expect(at("2026-10-07")).toBe("needs_review");
    expect(at("2026-10-08")).toBe("issue");
  });

  it("selects 2 weeks for public companies, remote voting, and electronic provision", () => {
    const publicCo = { ...NON_PUBLIC_WITH_BOARD, is_public_company: true };
    const eProvision = { ...NON_PUBLIC_WITH_BOARD, uses_electronic_provision: true };
    expect(resolveShareholderNoticePeriod(publicCo, NO_ARTICLES, NO_REMOTE_VOTING).days).toBe(14);
    expect(resolveShareholderNoticePeriod(eProvision, NO_ARTICLES, NO_REMOTE_VOTING).days).toBe(14);
    expect(
      resolveShareholderNoticePeriod(NON_PUBLIC_WITH_BOARD, NO_ARTICLES, { written_voting: true, electronic_voting: false }).days
    ).toBe(14);
  });

  it("honours articles shortening only for non-public companies without a board", () => {
    const noBoard = { ...NON_PUBLIC_WITH_BOARD, has_board: false };
    const shortened = { ...NO_ARTICLES, shareholders_notice_days: 3 };
    expect(resolveShareholderNoticePeriod(noBoard, shortened, NO_REMOTE_VOTING).days).toBe(3);
    expect(resolveShareholderNoticePeriod(noBoard, shortened, NO_REMOTE_VOTING).writtenRequired).toBe(false);
    expect(resolveShareholderNoticePeriod(NON_PUBLIC_WITH_BOARD, shortened, NO_REMOTE_VOTING).days).toBe(7);
    expect(resolveShareholderNoticePeriod(noBoard, shortened, { written_voting: true, electronic_voting: false }).days).toBe(14);
    expect(resolveShareholderNoticePeriod(noBoard, { ...NO_ARTICLES, shareholders_notice_days: 7 }, NO_REMOTE_VOTING).days).toBe(7);
  });

  it("board notice defaults to 1 week and accepts shorter articles", () => {
    expect(resolveBoardNoticePeriod(NO_ARTICLES).days).toBe(7);
    expect(resolveBoardNoticePeriod({ ...NO_ARTICLES, board_notice_days: 3 }).days).toBe(3);
  });
});

describe("jp_statutory_meetings — record date (会社法124条 · 民法143条)", () => {
  it("window ends on the day before the corresponding day three months later", () => {
    expect(recordDateWindow("2026-03-31", "2026-06-30", true).meeting_within_window).toBe(true);
    expect(recordDateWindow("2026-03-31", "2026-07-01", true).meeting_within_window).toBe(false);
    expect(periodEndAfterMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(periodEndAfterMonths("2026-01-30", 3)).toBe("2026-04-30");
    expect(periodEndAfterMonths("2027-11-29", 3)).toBe("2028-02-29");
  });

  it("requires public notice 2 weeks before the record date unless the articles define it", () => {
    expect(recordDateWindow("2026-09-30", "2026-11-20", false).public_notice_deadline).toBe("2026-09-15");
    expect(recordDateWindow("2026-09-30", "2026-11-20", true).public_notice_required).toBe(false);
  });
});

describe("jp_statutory_meetings — resolution thresholds (会社法309条・341条・369条)", () => {
  const strict = { ratio: MAJORITY, inclusive: false };
  it("過半数 is strictly more than half", () => {
    expect(meetsThreshold(500, 1000, strict)).toBe(false);
    expect(meetsThreshold(501, 1000, strict)).toBe(true);
  });

  it("特別決議 needs 2/3 or more of present votes", () => {
    const twoThirds = { ratio: TWO_THIRDS, inclusive: true };
    expect(meetsThreshold(599, 900, twoThirds)).toBe(false);
    expect(meetsThreshold(600, 900, twoThirds)).toBe(true);
    expect(meetsThreshold(601, 900, twoThirds)).toBe(true);
  });

  it("309条4項 needs 3/4 or more of all voting rights", () => {
    const threeQuarters = { ratio: THREE_QUARTERS, inclusive: true };
    expect(meetsThreshold(299, 400, threeQuarters)).toBe(false);
    expect(meetsThreshold(300, 400, threeQuarters)).toBe(true);
  });

  it("articles quorum of 1/3 is inclusive", () => {
    const oneThird = { ratio: MIN_ARTICLES_QUORUM, inclusive: true };
    expect(meetsThreshold(332, 999, oneThird)).toBe(false);
    expect(meetsThreshold(333, 999, oneThird)).toBe(true);
  });

  it("evaluates special resolutions with articles-reduced quorum", () => {
    const articles = { ...NO_ARTICLES, special_quorum: MIN_ARTICLES_QUORUM };
    const votes = (present: number, approving: number) => ({
      voting_rights_total: 999,
      voting_rights_present: present,
      voting_rights_for: approving,
    });
    expect(evaluateResolution(resolution({ type: "special", votes: votes(333, 222) }), articles).status).toBe("ok");
    expect(evaluateResolution(resolution({ type: "special", votes: votes(332, 332) }), articles).status).toBe("issue");
    expect(evaluateResolution(resolution({ type: "special", votes: votes(333, 221) }), articles).status).toBe("issue");
  });

  it("rejects articles quorum below the statutory 1/3 floor", () => {
    const articles = { ...NO_ARTICLES, election_quorum: { numerator: 1, denominator: 4 } };
    const votes = { voting_rights_total: 100, voting_rights_present: 90, voting_rights_for: 90 };
    expect(evaluateResolution(resolution({ type: "director_election", votes }), articles).status).toBe("issue");
  });

  it("ordinary quorum may be excluded by the articles", () => {
    const votes = { voting_rights_total: 1000, voting_rights_present: 200, voting_rights_for: 150 };
    expect(evaluateResolution(resolution({ votes }), NO_ARTICLES).status).toBe("issue");
    expect(evaluateResolution(resolution({ votes }), { ...NO_ARTICLES, ordinary_quorum_excluded: true }).status).toBe("ok");
  });

  it("309条3項 requires half of shareholders by headcount and 2/3 of their votes", () => {
    const votes = (headcount: number, rights: number) => ({
      voting_rights_total: 3000,
      voting_rights_for: rights,
      shareholders_total: 10,
      shareholders_for: headcount,
    });
    expect(evaluateResolution(resolution({ type: "special_309_3", votes: votes(5, 2000) }), NO_ARTICLES).status).toBe("ok");
    expect(evaluateResolution(resolution({ type: "special_309_3", votes: votes(4, 3000) }), NO_ARTICLES).status).toBe("issue");
    expect(evaluateResolution(resolution({ type: "special_309_3", votes: votes(10, 1999) }), NO_ARTICLES).status).toBe("issue");
  });

  it("board resolutions need a majority present and a majority of those present", () => {
    const votes = (eligible: number, present: number, approving: number) => ({
      directors_eligible: eligible,
      directors_present: present,
      directors_for: approving,
    });
    expect(evaluateResolution(resolution({ type: "board", votes: votes(4, 2, 2) }), NO_ARTICLES).status).toBe("issue");
    expect(evaluateResolution(resolution({ type: "board", votes: votes(4, 3, 2) }), NO_ARTICLES).status).toBe("ok");
    expect(evaluateResolution(resolution({ type: "board", votes: votes(4, 4, 2) }), NO_ARTICLES).status).toBe("issue");
  });

  it("returns needs_review for missing tallies or heightened articles, issue for inconsistent tallies", () => {
    const votes = { voting_rights_total: 100, voting_rights_present: 80, voting_rights_for: 70 };
    expect(evaluateResolution(resolution({}), NO_ARTICLES).status).toBe("needs_review");
    expect(evaluateResolution(resolution({ votes }), { ...NO_ARTICLES, heightened_requirements: true }).status).toBe("needs_review");
    const inconsistent = { voting_rights_total: 100, voting_rights_present: 80, voting_rights_for: 90 };
    expect(evaluateResolution(resolution({ votes: inconsistent }), NO_ARTICLES).status).toBe("issue");
    const failing = { voting_rights_total: 100, voting_rights_present: 80, voting_rights_for: 30 };
    expect(evaluateResolution(resolution({ votes: failing, outcome_recorded: "rejected" }), NO_ARTICLES).status).toBe("ok");
  });
});

describe("jp_statutory_meetings — omission paths (会社法300条・319条・368条2項・370条)", () => {
  it("300条 omission is unavailable when written or electronic voting is adopted", () => {
    const paths = shareholderOmissionPaths(meeting({ written_voting: true, convocation_omission: { eligible: 3, consented: 3 } }));
    expect(paths.find((p) => p.id === "convocation-omission-300")?.availability).toBe("not_available");
  });

  it("300条 omission applies only with unanimous consent", () => {
    const partial = shareholderOmissionPaths(meeting({ convocation_omission: { eligible: 3, consented: 2 } }));
    const full = shareholderOmissionPaths(meeting({ convocation_omission: { eligible: 3, consented: 3 } }));
    expect(partial[0]?.availability).toBe("available_with_unanimous_consent");
    expect(full[0]?.availability).toBe("applied");
  });

  it("370条 written board resolution requires an articles provision", () => {
    const wr = meeting({ mode: "written_resolution", written_consent: { eligible: 3, consented: 3 } });
    const withoutArticles = boardOmissionPaths(wr, NON_PUBLIC_WITH_BOARD, NO_ARTICLES);
    const withArticles = boardOmissionPaths(wr, NON_PUBLIC_WITH_BOARD, { ...NO_ARTICLES, allow_board_written_resolution: true });
    expect(withoutArticles[1]?.availability).toBe("not_available");
    expect(withArticles[1]?.availability).toBe("applied");
  });
});

describe("jp_statutory_meetings — minutes and retention (施行規則72条・101条 · 会社法318条・371条)", () => {
  const minutes = (overrides: Partial<MinutesRecord>): MinutesRecord => ({
    status: "finalized",
    medium: "paper",
    recorded_items: [],
    kept_at_head_office: true,
    branch_copy_kept: false,
    branch_access_measures: false,
    ...overrides,
  });

  it("detects missing required items and unconfirmed conditional items", () => {
    const itemSet = minutesItemSet("shareholders", "convened");
    const required = [...itemSet.required];
    expect(checkMinutesItems(itemSet, minutes({ recorded_items: required.slice(1) })).status).toBe("issue");
    expect(checkMinutesItems(itemSet, minutes({ recorded_items: required })).status).toBe("needs_review");
    expect(checkMinutesItems(itemSet, minutes({ recorded_items: required, conditional_items_applicable: [] })).status).toBe("ok");
    expect(checkMinutesItems(itemSet, minutes({ recorded_items: required, conditional_items_applicable: ["chair"] })).status).toBe("issue");
  });

  it("board minutes require attendee signatures (369条3項)", () => {
    expect(minutesItemSet("board", "convened").required).toContain("attendee_signatures");
    expect(minutesItemSet("board", "written_resolution").required).toContain("proposing_director");
  });

  it("keeps shareholders minutes 10 years at head office and 5 years at branches", () => {
    const plan = minutesRetentionPlan("shareholders", "2026-06-26", NON_PUBLIC_WITH_BOARD, minutes({}));
    expect(plan.head_office_until).toBe("2036-06-26");
    expect(plan.branch_copy_until).toBe("2031-06-26");
  });

  it("skips branch copies for electronic minutes with access measures and for board minutes", () => {
    const electronic = minutes({ medium: "electronic", branch_access_measures: true });
    expect(minutesRetentionPlan("shareholders", "2026-06-26", NON_PUBLIC_WITH_BOARD, electronic).branch_copy_required).toBe(false);
    expect(minutesRetentionPlan("board", "2026-06-26", NON_PUBLIC_WITH_BOARD, minutes({})).branch_copy_required).toBe(false);
  });

  it("requires written voting at 1,000 voting shareholders (298条2項)", () => {
    const status = (count: number, profile = NON_PUBLIC_WITH_BOARD) =>
      checkMandatoryWrittenVoting(meeting(), { ...profile, voting_shareholders_count: count }).status;
    expect(status(999)).toBe("ok");
    expect(status(1000)).toBe("issue");
    expect(status(1001, { ...NON_PUBLIC_WITH_BOARD, is_public_company: true })).toBe("needs_review");
    expect(checkMandatoryWrittenVoting(meeting(), NON_PUBLIC_WITH_BOARD).status).toBe("needs_review");
  });
});

describe("jp_statutory_meetings — CLI on seed data (demo)", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("has manifest, CLI registration, and valid skills", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(manifest?.security?.limits?.concurrent_jobs).toBe(1);
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain(MODULE_ID);
    expect(validateSkillRegistryFiles()).toEqual([]);
    expect(getSkillById("jp_shareholder_meeting_pack")?.agent_id).toBe("corporate_governance");
    expect(getSkillById("jp_board_meeting_pack")?.agent_id).toBe("corporate_governance");
  });

  it("manifest cli_commands match registered subcommands", () => {
    const program = new Command();
    const operationsCmd = program.command("operations");
    jp_statutory_meetingsCli.register({ program, operationsCmd });
    const root = operationsCmd.commands.find((c) => c.name() === "statutory-meetings");
    const registered = root?.commands.map((c) => c.name()).sort();
    expect(registered).toEqual([...(loadModuleManifest(MODULE_ID)?.cli_commands ?? [])].sort());
  });

  it("show loads seed meetings", () => {
    const summary = captureJson<{ jurisdiction: string; data_source: string; meetings: number; statutory_entries: number }>(
      () => runJpStatutoryMeetingsShow({ json: true })
    );
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.data_source).toBe("seed");
    expect(summary.meetings).toBeGreaterThan(0);
    expect(summary.statutory_entries).toBe(summary.meetings);
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpStatutoryMeetingsValidate();
    expect(spy).toHaveBeenCalledWith(`✓ ${MODULE_ID} — statutory meetings data OK`);
    spy.mockRestore();
  });

  it("schedule computes deadline, record-date window and omission paths", () => {
    const schedule = captureJson<{
      notice: { latest_dispatch_date: string; days_remaining: number; days: number };
      record_date: { window_end: string; meeting_within_window: boolean };
      omission_paths: Array<{ id: string; availability: string }>;
    }>(() => runJpStatutoryMeetingsSchedule({ meeting: "SM-2026-EGM-11", asOf: "2026-09-24", json: true }));
    expect(schedule.notice.days).toBe(7);
    expect(schedule.notice.latest_dispatch_date).toBe("2026-11-12");
    expect(schedule.notice.days_remaining).toBe(49);
    expect(schedule.record_date.window_end).toBe("2026-12-31");
    expect(schedule.record_date.meeting_within_window).toBe(true);
    expect(schedule.omission_paths.map((p) => p.id)).toEqual(["convocation-omission-300", "written-resolution-319"]);
  });

  it("checklist passes the compliant annual meeting and board meeting", () => {
    for (const id of ["SM-2026-AGM", "SM-2026-WR-05", "BM-2026-09"]) {
      const result = captureJson<{ result: string }>(() =>
        runJpStatutoryMeetingsChecklist({ meeting: id, asOf: "2026-09-24", json: true })
      );
      expect(result.result, id).toBe("pass");
    }
  });

  it("checklist detects the planted violations in SM-2026-EGM-07", () => {
    const result = captureJson<{ passed: boolean; checks: CheckItem[] }>(() =>
      runJpStatutoryMeetingsChecklist({ meeting: "SM-2026-EGM-07", asOf: "2026-09-24", json: true })
    );
    expect(result.passed).toBe(false);
    for (const id of [
      "notice-timing",
      "notice-method",
      "record-date-window",
      "record-date-notice",
      "resolution:R1",
      "minutes-required-items",
      "minutes-retention",
    ]) {
      expect(findCheck(result.checks, id)?.status, id).toBe("issue");
    }
    expect(findCheck(result.checks, "resolution:R2")?.status).toBe("needs_review");
  });

  it("checklist flags a written board resolution without an articles provision", () => {
    const result = captureJson<{ checks: CheckItem[] }>(() =>
      runJpStatutoryMeetingsChecklist({ meeting: "BM-2026-WR-08", json: true })
    );
    expect(findCheck(result.checks, "written-consent")?.status).toBe("issue");
  });

  it("checklist returns needs_review for an unsent notice before its deadline", () => {
    const result = captureJson<{ result: string; phase: string }>(() =>
      runJpStatutoryMeetingsChecklist({ meeting: "SM-2026-EGM-11", asOf: "2026-09-24", json: true })
    );
    expect(result.phase).toBe("pre_meeting");
    expect(result.result).toBe("needs_review");
  });

  it("draft renders notice and minutes without writing", () => {
    const json = captureJson<{ written: boolean; outputs: Array<{ name: string; path: string }> }>(() =>
      runJpStatutoryMeetingsDraft({ meeting: "SM-2026-AGM", json: true })
    );
    expect(json.written).toBe(false);
    expect(json.outputs.map((o) => o.name)).toEqual(["shoshu-tsuchi.md", "gijiroku.md"]);
    expect(json.outputs[0]?.path).toBe("docs/company/governance/SM-2026-AGM/shoshu-tsuchi.md");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpStatutoryMeetingsDraft({ meeting: "SM-2026-AGM" });
    const text = spy.mock.calls.map((call) => String(call[0])).join("\n");
    spy.mockRestore();
    expect(text).toContain("第8期定時株主総会 招集ご通知");
    expect(text).toContain("令和8年6月26日");
    expect(text).toContain("出席株主の議決権の3分の2以上の賛成");
    expect(text).not.toContain("{{");
  });
});

describe("jp_statutory_meetings non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("checklist fails the jurisdiction rule on hk-demo", () => {
    const result = captureJson<{ passed: boolean; checks: CheckItem[] }>(() =>
      runJpStatutoryMeetingsChecklist({ meeting: "SM-2026-AGM", asOf: "2026-09-24", json: true })
    );
    expect(result.passed).toBe(false);
    expect(findCheck(result.checks, "req-jp")?.status).toBe("issue");
  });
});
