import { describe, expect, it } from "vitest";
import { proposeReach } from "../src/lib/hr/talent-hiring/reach-proposal.js";
import { runHrTalentReach } from "../src/commands/hr.js";

describe("reach proposal", () => {
  it("proposes boards when the user wants more women, and does not draft a gendered posting", () => {
    const result = proposeReach("女子を取りたい。求人票には女性限定と書いて");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.audiences).toEqual(["women"]);
    expect(result.proposals.map((row) => row.id)).toEqual([
      "baitona_joshi",
      "townwork",
      "baitoru",
    ]);
    expect(result.withheld).toContain("求人票に年齢・性別を書かない");
    expect(result).not.toHaveProperty("posting");
    expect(JSON.stringify(result)).not.toContain("女性限定");
  });

  it("proposes younger-skewed boards for a twenties wish", () => {
    const result = proposeReach({ wish: "年齢層は20代がいい" });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.audiences).toEqual(["twenties"]);
    expect(result.proposals.map((row) => row.id)).toContain("timee");
    expect(result).not.toHaveProperty("posting");
  });

  it("asks with choices when the wish has no audience", () => {
    const result = proposeReach("指示に従う人がほしい");
    expect(result.status).toBe("need_answers");
    if (result.status !== "need_answers") return;
    expect(result.questions[0]?.options?.map((row) => row.id)).toEqual(["women", "twenties"]);
  });

  it("returns the same result from the hr command", () => {
    expect(runHrTalentReach({ wish: "女子を取りたい" })).toEqual(proposeReach("女子を取りたい"));
  });
});
