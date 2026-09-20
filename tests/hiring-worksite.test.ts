import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  BANCHO_HEIM_312_WORKSITE,
  confirmHiringWorksite,
  JOB_CATEGORY_OPTIONS,
  loadHiringWorksite,
  PASSIVE_SMOKING_OPTIONS,
  writeHiringWorksite,
} from "../src/lib/hr/hiring-worksite.js";
import { runHrWorksiteConfirm } from "../src/commands/hr.js";

describe("hiring worksite", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("loads the confirmed Bancho Heim worksite with Kojimachi access", () => {
    const loaded = loadHiringWorksite(BANCHO_HEIM_312_WORKSITE);
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") return;
    expect(loaded.worksite.access.nearest_stations[0]).toMatchObject({
      line: "東京メトロ有楽町線",
      station: "麹町",
      walk_minutes: 2,
    });
    expect(loaded.worksite.access.entry_method).toContain("インターフォン");
  });

  it("asks for Timee-style choices instead of free text", () => {
    const draft = {
      ...BANCHO_HEIM_312_WORKSITE,
      passive_smoking_choice: undefined,
      job_category_choice: undefined,
    };
    const result = confirmHiringWorksite(draft);
    expect(result.status).toBe("need_choices");
    if (result.status !== "need_choices") return;
    expect(result.missing).toEqual(["passive_smoking_choice", "job_category_choice"]);
    expect(result.passive_smoking_options.map((row) => row.id)).toEqual(
      PASSIVE_SMOKING_OPTIONS.map((row) => row.id),
    );
    expect(result.job_category_options.map((row) => row.id)).toEqual(
      JOB_CATEGORY_OPTIONS.map((row) => row.id),
    );
    expect(result.recommended?.passive_smoking_choice).toBe("indoor_smoke_free");
    expect(result.recommended?.job_category_choice).toBe("light_work");
  });

  it("becomes ready after catalog choices are selected", () => {
    const result = confirmHiringWorksite(
      {
        ...BANCHO_HEIM_312_WORKSITE,
        passive_smoking_choice: undefined,
        job_category_choice: undefined,
      },
      {
        passive_smoking_choice: "indoor_smoke_free",
        job_category_choice: "light_work",
      },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.worksite.passive_smoking_choice).toBe("indoor_smoke_free");
    expect(result.worksite.job_category_choice).toBe("light_work");
  });

  it("writes the worksite YAML for reuse on the next short-term job", () => {
    const dir = mkdtempSync(join(tmpdir(), "orgos-worksite-"));
    dirs.push(dir);
    const path = join(dir, "WS-bancho-heim-312.yaml");
    const confirmed = confirmHiringWorksite(BANCHO_HEIM_312_WORKSITE, {
      passive_smoking_choice: "indoor_smoke_free",
      job_category_choice: "light_work",
    });
    expect(confirmed.status).toBe("ready");
    if (confirmed.status !== "ready") return;
    writeHiringWorksite(path, confirmed.worksite);
    const raw = YAML.parse(readFileSync(path, "utf8"));
    expect(raw.worksite_id).toBe("WS-bancho-heim-312");
    expect(raw.access.nearest_stations[0].station).toBe("麹町");
  });

  it("returns ready from the hr command when choices are already set", () => {
    expect(runHrWorksiteConfirm({ worksite: BANCHO_HEIM_312_WORKSITE })).toEqual(
      confirmHiringWorksite(BANCHO_HEIM_312_WORKSITE),
    );
    expect(confirmHiringWorksite(BANCHO_HEIM_312_WORKSITE).status).toBe("ready");
  });
});
