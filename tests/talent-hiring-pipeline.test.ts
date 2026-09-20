import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { humanApprovalSubjectDigest } from "../src/lib/org/human-approval-context.js";
import { canonicalJson } from "../src/lib/protocol/canonical.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { runHrTalentHear } from "../src/commands/hr.js";
import {
  filterCandidates,
  generateRFP,
  hearJobRequest,
  proposeShortTermTalentApproval,
  type ProjectRequirement,
  type RfpEnricher,
  type StructuredRFP,
  type TalentCandidate,
} from "../src/lib/hr/talent-hiring-pipeline.js";

const requirement: ProjectRequirement = {
  summary: "AIモデルの精度向上のためのアドバイザーが欲しい",
  domain: "ml",
  budget: { max_hourly_rate: 15_000, currency: "JPY" },
  duration_days: 30,
  must_have_skills: ["python", "ml"],
};

function payloadDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

describe("generateRFP", () => {
  it("builds a structured RFP from a project requirement", () => {
    const rfp = generateRFP(requirement);

    expect(rfp.title).toBe(requirement.summary);
    expect(rfp.scope).toContain(requirement.summary);
    expect(rfp.scope).toContain(requirement.domain);
    expect(rfp.scope).toContain(String(requirement.duration_days));
    expect(rfp.selection_criteria).toEqual(requirement.must_have_skills);
    expect(rfp.budget).toEqual(requirement.budget);
    expect(rfp.must_have_skills).toEqual(requirement.must_have_skills);
    expect(rfp.min_years).toBe(0);
  });

  it("applies a mock enricher without calling an external API", () => {
    const enricher: RfpEnricher = {
      enrich(input) {
        expect(input).toEqual(requirement);
        return {
          title: "Enriched AI advisor",
          selection_criteria: ["peer-reviewed", "production"],
          min_years: 8,
        };
      },
    };

    const rfp = generateRFP(requirement, { enricher });

    expect(rfp.title).toBe("Enriched AI advisor");
    expect(rfp.selection_criteria).toEqual(["peer-reviewed", "production"]);
    expect(rfp.min_years).toBe(8);
    expect(rfp.budget).toEqual(requirement.budget);
    expect(rfp.must_have_skills).toEqual(requirement.must_have_skills);
    expect(rfp.scope).toContain(requirement.summary);
  });
});

describe("filterCandidates", () => {
  const rfp: StructuredRFP = {
    title: requirement.summary!,
    scope: "scope",
    selection_criteria: ["python", "ml"],
    budget: { max_hourly_rate: 15_000, currency: "JPY" },
    must_have_skills: ["python", "ml"],
    min_years: 5,
  };

  const candidates: TalentCandidate[] = [
    {
      candidate_id: "C-030",
      display_name: "仮名C",
      skills: ["python", "ml", "nlp"],
      years: 9,
      hourly_rate: 14_000,
    },
    {
      candidate_id: "C-010",
      display_name: "仮名A",
      skills: ["python", "ml"],
      years: 8,
      hourly_rate: 10_000,
    },
    {
      candidate_id: "C-020",
      display_name: "仮名B",
      skills: ["python", "ml"],
      years: 8,
      hourly_rate: 9_000,
    },
    {
      candidate_id: "C-040",
      display_name: "仮名D",
      skills: ["python"],
      years: 12,
      hourly_rate: 8_000,
    },
    {
      candidate_id: "C-050",
      display_name: "仮名E",
      skills: ["python", "ml"],
      years: 10,
      hourly_rate: 16_000,
    },
    {
      candidate_id: "C-060",
      display_name: "仮名F",
      skills: ["python", "ml"],
      years: 4,
      hourly_rate: 8_000,
    },
    {
      candidate_id: "C-070",
      display_name: "仮名G",
      skills: ["ml", "python"],
      years: 5,
      hourly_rate: 15_000,
    },
  ];

  it("drops candidates who miss a required skill, exceed budget, or lack years", () => {
    const shortlist = filterCandidates(rfp, candidates, 10);
    const ids = shortlist.map((row) => row.candidate_id);

    expect(ids).toEqual(["C-030", "C-010", "C-020", "C-070"]);
    expect(shortlist.map((row) => row.score)).toEqual([11, 10, 10, 7]);
  });

  it("keeps only the top N and breaks score ties by candidate_id", () => {
    const shortlist = filterCandidates(rfp, candidates, 2);

    expect(shortlist.map((row) => row.candidate_id)).toEqual(["C-030", "C-010"]);
  });

  it("returns an empty list for no candidates or topN of zero", () => {
    expect(filterCandidates(rfp, [], 3)).toEqual([]);
    expect(filterCandidates(rfp, candidates, 0)).toEqual([]);
  });

  it("returns every eligible candidate when topN exceeds the shortlist", () => {
    expect(filterCandidates(rfp, candidates, 99)).toHaveLength(4);
  });
});

describe("proposeShortTermTalentApproval", () => {
  const rfp: StructuredRFP = {
    title: "AI advisor",
    scope: "scope",
    selection_criteria: ["python"],
    budget: { max_hourly_rate: 15_000, currency: "JPY" },
    must_have_skills: ["python"],
    min_years: 0,
  };
  const shortlist = filterCandidates(
    rfp,
    [
      {
        candidate_id: "C-002",
        display_name: "仮名B",
        skills: ["python"],
        years: 3,
        hourly_rate: 10_000,
      },
      {
        candidate_id: "C-001",
        display_name: "仮名A",
        skills: ["python"],
        years: 6,
        hourly_rate: 12_000,
      },
    ],
    2,
  );
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
      rfp,
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
    expect(result.payload.rfp_title).toBe(rfp.title);
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
