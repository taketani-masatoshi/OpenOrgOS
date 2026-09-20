import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  runHrDismissalReadiness,
  runHrTalentFlow,
  runHrTalentShortlist,
} from "../src/commands/hr.js";
import {
  evaluateDismissalReadiness,
  prepareDismissalReadinessChecklist,
  writeDismissalReadinessShells,
} from "../src/lib/hr/dismissal-readiness.js";
import { loadRecruitingJob } from "../src/lib/hr/recruiting-job.js";
import type { JobPosting, TalentCandidate } from "../src/lib/hr/talent-hiring-pipeline.js";

const passed = {
  learns_procedure: true,
  follows_any_supervisor: true,
  adapts_to_one_change: true,
  reports_exceptions: true,
  safe_workwear: true,
};

function trialCandidate(candidateId: string, hourlyRate: number): TalentCandidate {
  return {
    candidate_id: candidateId,
    display_name: `仮名${candidateId}`,
    hourly_rate: hourlyRate,
    ...passed,
  };
}

const machinePosting: JobPosting = {
  title: "新しい機械で軽い動作を繰り返す",
  starts_on: "2026-10-01",
  duration_days: 30,
  headcount: 1,
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

const completeLedger = {
  work_rules_ref: "docs/company/hr/work-rules.md",
  dismissal_ground_refs: ["WR-42"],
  notice_procedure: "thirty_day_notice" as const,
  labor_condition_notice_template_ref: "docs/company/hr/labor-condition-notice.md",
  guidance_process_ref: "docs/company/hr/guidance-process.md",
  fact_record_policy_ref: "docs/company/hr/fact-record-policy.md",
  probation_policy_ref: "docs/company/hr/probation-policy.md",
};

describe("evaluateDismissalReadiness", () => {
  it("scores company documents without naming a person or authorizing dismissal", () => {
    const result = evaluateDismissalReadiness(completeLedger);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.score).toBe(100);
    expect(result.documents_present).toBe(true);
    expect(result.verdict).toBe("documents_present");
    expect(result.missing).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/解雇できる|予告すれば足りる|自由に終了|EMP-|従業員/);
    expect(result.notes.join("\n")).toContain("対象者の決定ではない");
  });

  it("lists missing company documents before a dismissal target exists", () => {
    const result = evaluateDismissalReadiness({
      work_rules_ref: "docs/company/hr/work-rules.md",
      dismissal_ground_refs: ["WR-42"],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.documents_present).toBe(false);
    expect(result.verdict).toBe("not_ready");
    expect(result.score).toBeLessThan(100);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "notice_procedure",
        "labor_condition_notice_template_ref",
        "guidance_process_ref",
        "fact_record_policy_ref",
      ]),
    );
  });

  it("treats missing files on disk as incomplete when docsRoot is set", () => {
    const docsRoot = mkdtempSync(join(tmpdir(), "orgos-dismissal-missing-"));
    try {
      const result = evaluateDismissalReadiness(completeLedger, { docsRoot });
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.documents_present).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    } finally {
      rmSync(docsRoot, { recursive: true, force: true });
    }
  });

  it("rejects employee_id or age on the ledger", () => {
    expect(evaluateDismissalReadiness({ ...completeLedger, age: 50 }).status).toBe("rejected");
    expect(evaluateDismissalReadiness({ ...completeLedger, employee_id: "EMP-1" }).status).toBe(
      "rejected",
    );
  });

  it("returns the same result from the hr command", () => {
    expect(runHrDismissalReadiness({ ledger: completeLedger })).toEqual(
      evaluateDismissalReadiness(completeLedger),
    );
  });
});

describe("prepareDismissalReadinessChecklist", () => {
  it("prepares next document actions without writing a dismissal procedure body", () => {
    const checklist = prepareDismissalReadinessChecklist({
      work_rules_ref: "docs/company/hr/work-rules.md",
    });

    expect(checklist.actions.length).toBeGreaterThan(0);
    expect(checklist.actions.every((row) => row.ref.length > 0 && row.purpose.length > 0)).toBe(true);
    expect(JSON.stringify(checklist)).not.toMatch(/解雇通知書の本文|予告手当の計算|対象者を決める/);
  });

  it("writes shells and reaches documents_present on re-evaluate", () => {
    const docsRoot = mkdtempSync(join(tmpdir(), "orgos-dismissal-write-"));
    try {
      const written = writeDismissalReadinessShells({ docsRoot, ledger: {} });
      const result = evaluateDismissalReadiness(written.ledger, { docsRoot });
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.score).toBe(100);
      expect(result.documents_present).toBe(true);
      expect(written.written.length).toBeGreaterThan(0);
      for (const ref of written.written) {
        const body = readFileSync(join(docsRoot, ref.replace(/^docs\//, "")), "utf8");
        expect(body).not.toMatch(/解雇通知|予告手当の計算|対象者を決める/);
      }
    } finally {
      rmSync(docsRoot, { recursive: true, force: true });
    }
  });
});

describe("regular shortlist uses company dismissal readiness", () => {
  const actors = {
    proposedBy: "recruiting",
    operatorId: "OP-001",
    approverId: "APR-001",
    apiOrigin: "http://127.0.0.1:9470",
  };
  const prerequisites = {
    work_rules_ref: "docs/company/hr/work-rules.md",
    dismissal_ground_refs: ["WR-42"],
    notice_procedure: "thirty_day_notice" as const,
    probation_days: 90,
    labor_conditions: {
      period_fixed: false,
      wage: "時給1500円",
      work_hours: "09:00-18:00",
      workplace: "本社工場",
    },
  };

  let prevStepUp: string | undefined;
  let prevStore: string | undefined;
  let challengeDir: string;
  let approvalsPath: string;
  let approvalsSnapshot: Buffer | null = null;

  beforeEach(() => {
    challengeDir = mkdtempSync(join(tmpdir(), "orgos-dismissal-ready-"));
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

  it("blocks regular shortlist when company readiness is incomplete", () => {
    const before = approvalsSnapshot;
    const result = runHrTalentShortlist({
      posting: machinePosting,
      candidates: [trialCandidate("C-020", 900)],
      terms: {
        engagement: "regular",
        hours: 40,
        currency: "JPY",
        max_total: 100_000,
      },
      prerequisites,
      company_readiness: { work_rules_ref: "docs/company/hr/work-rules.md" },
      ...actors,
    });

    expect(result.status).toBe("need_prerequisites");
    expect(result).not.toHaveProperty("approval");
    const after = existsSync(approvalsPath) ? readFileSync(approvalsPath) : null;
    expect(after).toEqual(before);
  });

  it("allows regular shortlist only when company readiness documents are present", () => {
    const result = runHrTalentShortlist({
      posting: machinePosting,
      candidates: [trialCandidate("C-020", 900)],
      terms: {
        engagement: "regular",
        hours: 40,
        currency: "JPY",
        max_total: 100_000,
      },
      prerequisites,
      company_readiness: completeLedger,
      ...actors,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.approval.status).toBe("pending_approval");
    expect(result.settlement_required).toBe(true);
    expect(result.approval.subject_type).toBe("talent_regular");
  });
});

describe("recruiting job and talent flow", () => {
  let prevStepUp: string | undefined;
  let prevStore: string | undefined;
  let challengeDir: string;
  let approvalsPath: string;
  let approvalsSnapshot: Buffer | null = null;

  beforeEach(() => {
    challengeDir = mkdtempSync(join(tmpdir(), "orgos-talent-flow-"));
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

  const fixedTermJob = {
    job_id: "JOB-001",
    posting: machinePosting,
    engagement: "fixed_term",
    director: "現場担当",
    candidates: [trialCandidate("C-020", 900)],
    terms: {
      engagement: "fixed_term",
      hours: 40,
      currency: "JPY",
      max_total: 100_000,
    },
    operator_id: "OP-001",
    approver_id: "APR-001",
    api_origin: "http://127.0.0.1:9470",
  };

  it("loads a recruiting job and rejects age keys", () => {
    expect(loadRecruitingJob(fixedTermJob).status).toBe("ready");
    expect(loadRecruitingJob({ ...fixedTermJob, age: 40 }).status).toBe("rejected");
  });

  it("runs fixed_term flow to settlement wait even at 100000", () => {
    const result = runHrTalentFlow({ job: fixedTermJob });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.pack.exit_name).toBe("期間満了・更新しない");
    expect(result.shortlist.approval.status).toBe("pending_approval");
    expect(result.shortlist.settlement_required).toBe(true);
    expect(result.shortlist.settlement?.challenge_id).toMatch(/^SCH-/);
    expect(result.shortlist.approval.subject_type).toBe("talent_fixed_term");
  });

  it("stops regular flow when company readiness is incomplete", () => {
    const before = approvalsSnapshot;
    const result = runHrTalentFlow({
      job: {
        ...fixedTermJob,
        job_id: "JOB-002",
        engagement: "regular",
        terms: { ...fixedTermJob.terms, engagement: "regular" },
        company_readiness: { work_rules_ref: "docs/company/hr/work-rules.md" },
      },
    });
    expect(result.status).toBe("need_prerequisites");
    const after = existsSync(approvalsPath) ? readFileSync(approvalsPath) : null;
    expect(after).toEqual(before);
  });

  it("rejects engagement mismatch between choice and terms", () => {
    const result = loadRecruitingJob({
      ...fixedTermJob,
      engagement: "contractor",
      terms: { ...fixedTermJob.terms, engagement: "fixed_term" },
    });
    expect(result.status).toBe("rejected");
  });
});
