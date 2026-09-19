import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/lib/protocol/canonical.js";
import {
  buildPassKeyPayload,
  filterCandidates,
  generateRFP,
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

describe("buildPassKeyPayload", () => {
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
  const terms = {
    engagement: "advisor",
    hours: 40,
    currency: "JPY",
    max_total: 600_000,
  };
  const input = {
    rfp,
    shortlist,
    terms,
    clock: () => "2026-09-20T00:00:00.000Z",
    id: "PKA-TEST-001",
  };

  it("builds a settlement signing request whose hash is canonical SHA-256", () => {
    const request = buildPassKeyPayload(input);

    expect(request.ceremony_kind).toBe("settlement");
    expect(request.request_id).toBe("PKA-TEST-001");
    expect(request.created_at).toBe("2026-09-20T00:00:00.000Z");
    expect(request.payload.candidate_ids).toEqual(["C-001", "C-002"]);
    expect(request.payload.terms).toEqual(terms);
    expect(request.payload.rfp_title).toBe(rfp.title);
    expect(request.payload_hash).toBe(payloadDigest(request.payload));
    expect(request.payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("repeats the same hash for the same input and changes it when the payload is tampered", () => {
    const first = buildPassKeyPayload(input);
    const second = buildPassKeyPayload(input);
    const tampered = {
      ...first.payload,
      candidate_ids: ["C-999"],
    };

    expect(second.payload_hash).toBe(first.payload_hash);
    expect(payloadDigest(tampered)).not.toBe(first.payload_hash);
  });
});
