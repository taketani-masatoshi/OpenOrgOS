import { describe, expect, it } from "vitest";
import { buildPlatformListings } from "../src/lib/hr/talent-hiring/platform-listings.js";
import { runHrTalentPlatforms } from "../src/commands/hr.js";

const engineerFacts = {
  title: "社内ツールの改修",
  scope: "既存画面の不具合を直し、月次で差分を渡す",
  deliverables: "修正差分と動作確認メモ",
  monthly_jpy: 400_000,
  days_per_week: 3,
  hours_per_day: 4,
  monthly_hours_band: "40" as const,
  work_style: "remote" as const,
  skills: ["TypeScript"],
  role_family: "engineer" as const,
};

describe("platform listings", () => {
  it("asks for the hours band instead of inventing one", () => {
    const result = buildPlatformListings({ ...engineerFacts, monthly_hours_band: undefined });
    expect(result.status).toBe("need_answers");
    if (result.status !== "need_answers") return;
    const band = result.questions.find((row) => row.field === "monthly_hours_band");
    expect(band?.recommended).toBe("40");
    expect(band?.options?.map((row) => row.id)).toEqual(["40", "96", "160"]);
  });

  it("writes a contractor listing for every platform when the role is engineer", () => {
    const result = buildPlatformListings(engineerFacts);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.engagement).toBe("contractor");
    expect(result.coverage).toBe("all");
    expect(result.listings.map((row) => row.platform)).toEqual([
      "workship",
      "fukugyo_cloud",
      "crowdsourcing",
      "it_agent",
    ]);
    for (const row of result.listings) {
      expect(row.status).toBe("ready");
      expect(row.body).toContain("日常の指揮命令をしない");
      expect(row.body).toContain("初回3ヶ月");
      expect(row.body).toContain("最長6ヶ月");
      expect(row.body).toContain("400000");
      expect(row.body).not.toContain("有期雇用");
    }
    expect(result.fallback_note).toContain("有期雇用");
    expect(result.listings.find((row) => row.platform === "crowdsourcing")?.targets).toEqual([
      "クラウドワークス",
      "ランサーズ",
    ]);
  });

  it("skips IT agent platforms when the role is not engineering", () => {
    const result = buildPlatformListings({ ...engineerFacts, role_family: "designer" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.coverage).toBe("partial");
    expect(result.listings.find((row) => row.platform === "it_agent")?.status).toBe("not_applicable");
    expect(result.listings.find((row) => row.platform === "workship")?.status).toBe("ready");
  });

  it("refuses daily direction on these platforms", () => {
    const directed = buildPlatformListings({ ...engineerFacts, company_directs_daily: true });
    expect(directed.status).toBe("use_employment");
    if (directed.status !== "use_employment") return;
    expect(directed.engagement).toBe("fixed_term");
    expect(directed).not.toHaveProperty("listings");

    const written = buildPlatformListings({
      ...engineerFacts,
      scope: "毎日指示どおりに画面を直す",
    });
    expect(written.status).toBe("use_employment");
  });

  it("rejects age or gender", () => {
    expect(buildPlatformListings({ ...engineerFacts, age: 30 }).status).toBe("rejected");
    expect(buildPlatformListings({ ...engineerFacts, gender: "female" }).status).toBe("rejected");
  });

  it("returns the same result from the hr command", () => {
    expect(runHrTalentPlatforms({ facts: engineerFacts })).toEqual(buildPlatformListings(engineerFacts));
  });
});
