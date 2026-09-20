import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { humanApprovalSubjectDigest } from "../src/lib/org/human-approval-context.js";
import { canonicalJson } from "../src/lib/protocol/canonical.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { runHrTalentHear, runHrTalentShortlist } from "../src/commands/hr.js";
import {
  filterCandidates,
  hearJobRequest,
  proposeShortTermTalentApproval,
  type JobPosting,
  type TalentCandidate,
} from "../src/lib/hr/talent-hiring-pipeline.js";

function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

const passed = {
  learns_procedure: true,
  follows_any_supervisor: true,
  adapts_to_one_change: true,
  reports_exceptions: true,
  safe_workwear: true,
};

function trialCandidate(
  candidateId: string,
  hourlyRate: number,
  overrides: Partial<TalentCandidate> = {},
): TalentCandidate {
  return {
    candidate_id: candidateId,
    display_name: `仮名${candidateId}`,
    hourly_rate: hourlyRate,
    ...passed,
    ...overrides,
  };
}

const machinePosting: JobPosting = {
  title: "新しい機械で軽い動作を繰り返す",
  starts_on: "2026-10-01",
  duration_days: 30,
  headcount: 2,
  max_hourly_rate: 1500,
  currency: "JPY",
  duties: "新しい機械で軽い動作を繰り返す",
  checks: [
    "説明のあと、手順を一人で1サイクル完了できる",
    "指示者の年齢や役職に関係なく、担当者の指示どおりに動ける",
    "作業中の手順変更1つに合わせられる",
    "わからないことと異常をその場で報告できる",
    "指定の服装で、髪・爪・装飾が作業の妨げにならない",
  ],
  body: "求人票",
};

describe("filterCandidates", () => {
  const candidates = [
    trialCandidate("C-030", 1400),
    trialCandidate("C-010", 1000),
    trialCandidate("C-020", 900),
    trialCandidate("C-015", 900),
    trialCandidate("C-040", 800, { learns_procedure: false }),
    trialCandidate("C-050", 1600),
  ];

  it("keeps only candidates who pass every check within the hourly cap, cheapest first", () => {
    const shortlist = filterCandidates(machinePosting, candidates);

    expect(shortlist.map((row) => row.candidate_id)).toEqual(["C-015", "C-020"]);
  });

  it("returns an empty list when nobody is eligible", () => {
    expect(filterCandidates(machinePosting, [trialCandidate("C-040", 800, { learns_procedure: false })])).toEqual(
      [],
    );
  });
});

describe("proposeShortTermTalentApproval", () => {
  const shortlist = [trialCandidate("C-001", 12_000), trialCandidate("C-002", 10_000)];
  const actors = {
    proposedBy: "recruiting",
    operatorId: "OP-001",
    approverId: "APR-001",
    apiOrigin: "http://127.0.0.1:9470",
  };

  let prevStepUp: string | undefined;
  let prevStore: string | undefined;
  let challengeDir: string;
  let approvalsPath: string;
  let approvalsSnapshot: Buffer | null = null;

  beforeEach(() => {
    challengeDir = mkdtempSync(join(tmpdir(), "orgos-talent-settlement-"));
    prevStepUp = process.env.ORGOS_SETTLEMENT_STEPUP;
    prevStore = process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = join(challengeDir, "challenges.json");
    setTenantId("mal");
    approvalsPath = join(getDataDir(), "org/pending-approvals.yaml");
    approvalsSnapshot = existsSync(approvalsPath) ? readFileSync(approvalsPath) : null;
  });

  afterEach(() => {
    if (approvalsSnapshot) writeFileSync(approvalsPath, approvalsSnapshot);
    else if (existsSync(approvalsPath)) rmSync(approvalsPath, { force: true });
    if (prevStepUp === undefined) delete process.env.ORGOS_SETTLEMENT_STEPUP;
    else process.env.ORGOS_SETTLEMENT_STEPUP = prevStepUp;
    if (prevStore === undefined) delete process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    else process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = prevStore;
    rmSync(challengeDir, { recursive: true, force: true });
  });

  function propose(maxTotal: number) {
    return proposeShortTermTalentApproval({
      title: "AI advisor",
      shortlist,
      terms: {
        engagement: "advisor",
        hours: 40,
        currency: "JPY",
        max_total: maxTotal,
      },
      ...actors,
    });
  }

  it("binds the canonical payload hash to the pending approval subject_ref", () => {
    const result = propose(600_000);
    const tampered = {
      ...result.payload,
      candidate_ids: ["C-999"],
    };

    expect(result.approval.status).toBe("pending_approval");
    expect(result.approval.subject_type).toBe("short_term_talent");
    expect(result.approval.scope).toBe("internal");
    expect(result.payload.candidate_ids).toEqual(["C-001", "C-002"]);
    expect(result.payload.rfp_title).toBe("AI advisor");
    expect(JSON.stringify(result.payload)).not.toContain("仮名");
    expect(result.payload_hash).toBe(payloadDigest(result.payload));
    expect(result.approval.subject_ref).toBe(result.payload_hash);
    expect(payloadDigest(tampered)).not.toBe(result.payload_hash);
    expect(
      humanApprovalSubjectDigest({
        ...result.approval,
        subject_ref: payloadDigest(tampered),
      }),
    ).not.toBe(humanApprovalSubjectDigest(result.approval));
  });

  it("does not mint a settlement challenge at or under the tier A cap", () => {
    const result = propose(100_000);

    expect(result.approval.status).toBe("pending_approval");
    expect(result.settlement_required).toBe(false);
    expect(result.settlement).toBeUndefined();
  });

  it("mints the existing settlement challenge above the tier A cap", () => {
    const result = propose(100_001);

    expect(result.approval.status).toBe("pending_approval");
    expect(result.settlement_required).toBe(true);
    expect(result.settlement?.ceremony_kind).toBe("settlement");
    expect(result.settlement?.challenge_id).toMatch(/^SCH-/);
    expect(result.settlement?.webauthn_challenge.length).toBeGreaterThan(0);
    expect(result.settlement?.token.length).toBeGreaterThan(0);
    expect(result.settlement?.rp_id.length).toBeGreaterThan(0);
    expect(result.settlement?.expires_at.length).toBeGreaterThan(0);
  });
});

const completeHearing = {
  work_summary: "新しい機械で軽い動作を繰り返す",
  starts_on: "2026-10-01",
  duration_days: 30,
  headcount: 1,
  max_hourly_rate: 1500,
  currency: "JPY",
};

describe("hearJobRequest", () => {
  it("asks five questions and does not write a posting when nothing is answered", () => {
    const result = hearJobRequest({});

    expect(result.status).toBe("need_answers");
    if (result.status !== "need_answers") return;
    expect(result.questions.map((question) => question.field)).toEqual([
      "work_summary",
      "starts_on",
      "duration_days",
      "headcount",
      "pay",
    ]);
    expect(result).not.toHaveProperty("posting");
  });

  it("asks only for the fields that are still missing", () => {
    const result = hearJobRequest({
      work_summary: "新しい機械で軽い動作を繰り返す",
    });

    expect(result.status).toBe("need_answers");
    if (result.status !== "need_answers") return;
    expect(result.questions.map((question) => question.field)).toEqual([
      "starts_on",
      "duration_days",
      "headcount",
      "pay",
    ]);
    expect(result).not.toHaveProperty("posting");
  });

  it("writes a posting with the practical checks once the hearing is complete", () => {
    const result = hearJobRequest(completeHearing);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.posting.starts_on).toBe("2026-10-01");
    expect(result.posting.duration_days).toBe(30);
    expect(result.posting.headcount).toBe(1);
    expect(result.posting.max_hourly_rate).toBe(1500);
    expect(result.posting.currency).toBe("JPY");
    expect(result.posting.checks).toEqual([
      "説明のあと、手順を一人で1サイクル完了できる",
      "指示者の年齢や役職に関係なく、担当者の指示どおりに動ける",
      "作業中の手順変更1つに合わせられる",
      "わからないことと異常をその場で報告できる",
      "指定の服装で、髪・爪・装飾が作業の妨げにならない",
    ]);
    expect(result.posting.body).toContain("2026-10-01");
    expect(result.posting.body).toContain("30");
    expect(result.posting.body).toContain("1名");
    expect(result.posting.body).toContain("1500");
    expect(result.posting.body).toContain("短い実演");
    expect(result.posting.body).toContain("年齢・性別では選考しない");
    for (const check of result.posting.checks) {
      expect(result.posting.body).toContain(check);
    }
  });

  it("refuses age or gender instead of writing a posting", () => {
    for (const answers of [
      { ...completeHearing, age: 50 },
      { ...completeHearing, gender: "female" },
      { ...completeHearing, birth_date: "1970-01-01" },
      { ...completeHearing, work_summary: "50歳以上不可" },
      { ...completeHearing, work_summary: "20代" },
      { ...completeHearing, work_summary: "女性のみ" },
    ]) {
      const result = hearJobRequest(answers);
      expect(result.status).toBe("rejected");
      expect(result).not.toHaveProperty("posting");
    }
  });

  it("returns the same result from the hr command", () => {
    expect(runHrTalentHear({ answers: completeHearing })).toEqual(hearJobRequest(completeHearing));
  });
});

describe("talent shortlist", () => {
  const actors = {
    proposedBy: "recruiting",
    operatorId: "OP-001",
    approverId: "APR-001",
    apiOrigin: "http://127.0.0.1:9470",
  };
  const candidates = [trialCandidate("C-010", 1000), trialCandidate("C-020", 900)];
  const terms = {
    engagement: "fixed_term",
    hours: 40,
    currency: "JPY",
    max_total: 100_000,
  };

  let prevStepUp: string | undefined;
  let prevStore: string | undefined;
  let challengeDir: string;
  let approvalsPath: string;
  let approvalsSnapshot: Buffer | null = null;

  beforeEach(() => {
    challengeDir = mkdtempSync(join(tmpdir(), "orgos-talent-shortlist-"));
    prevStepUp = process.env.ORGOS_SETTLEMENT_STEPUP;
    prevStore = process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = join(challengeDir, "challenges.json");
    setTenantId("mal");
    approvalsPath = join(getDataDir(), "org/pending-approvals.yaml");
    approvalsSnapshot = existsSync(approvalsPath) ? readFileSync(approvalsPath) : null;
  });

  afterEach(() => {
    if (approvalsSnapshot) writeFileSync(approvalsPath, approvalsSnapshot);
    else if (existsSync(approvalsPath)) rmSync(approvalsPath, { force: true });
    if (prevStepUp === undefined) delete process.env.ORGOS_SETTLEMENT_STEPUP;
    else process.env.ORGOS_SETTLEMENT_STEPUP = prevStepUp;
    if (prevStore === undefined) delete process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    else process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = prevStore;
    rmSync(challengeDir, { recursive: true, force: true });
  });

  function input(maxTotal: number, rows: unknown = candidates) {
    return {
      posting: { ...machinePosting, headcount: 1 },
      candidates: rows,
      terms: { ...terms, max_total: maxTotal },
      ...actors,
    };
  }

  it("refuses age, gender, or birth date before proposing an approval", () => {
    const before = approvalsSnapshot;
    for (const rows of [
      [{ ...trialCandidate("C-010", 1000), age: 50 }],
      [{ ...trialCandidate("C-010", 1000), gender: "female" }],
      [{ ...trialCandidate("C-010", 1000), birth_date: "1970-01-01" }],
    ]) {
      const result = runHrTalentShortlist(input(100_000, rows));
      expect(result.status).toBe("rejected");
      expect(result).not.toHaveProperty("approval");
    }
    const after = existsSync(approvalsPath) ? readFileSync(approvalsPath) : null;
    expect(after).toEqual(before);
  });

  it("returns the shortlist and skips settlement at or under the tier A cap", () => {
    const result = runHrTalentShortlist(input(100_000));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.shortlist.map((row) => row.candidate_id)).toEqual(["C-020"]);
    expect(result.approval.status).toBe("pending_approval");
    expect(result.settlement_required).toBe(false);
    expect(result.settlement).toBeUndefined();
  });

  it("mints a settlement challenge above the tier A cap", () => {
    const result = runHrTalentShortlist(input(100_001));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.approval.status).toBe("pending_approval");
    expect(result.settlement_required).toBe(true);
    expect(result.settlement?.challenge_id).toMatch(/^SCH-/);
    expect(result.settlement?.webauthn_challenge.length).toBeGreaterThan(0);
  });
});
