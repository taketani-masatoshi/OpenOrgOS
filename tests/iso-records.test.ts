/**
 * A record that exists is not the same as a record that holds up. These tests
 * pin each rule in the closed vocabulary to a concrete fault, so a spec that
 * stops catching something fails here rather than in an audit.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isoRecordSpecSchema } from "../schemas/iso-record-spec.js";
import {
  checkRecord,
  checkRecordsForStandard,
  formatRecordReports,
  invalidRecordPaths,
  loadRecordSpecs,
  recordRelPath,
} from "../src/lib/iso-records.js";
import { buildKpiReport } from "../src/lib/iso-kpi.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { listAvailableIsoIds } from "../src/lib/iso-catalog.js";
import { CORE_TEMPLATES_DIR, packTemplatesDir } from "../src/lib/iso-templates.js";

const TENANT = `iso-records-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);
const evidenceDir = join(tenantDir, "docs/compliance/iso/ISO-21401");

function writeRecord(file: string, body: string): void {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, file), body, "utf-8");
}

/** Check one inline spec against one inline file, returning error messages. */
function errorsFor(spec: unknown, file: string, body: string): string[] {
  writeRecord(file, body);
  const parsed = isoRecordSpecSchema.parse(spec);
  return checkRecord("ISO-21401", parsed)
    .issues.filter((i) => i.severity === "error")
    .map((i) => i.message);
}

beforeAll(() => {
  mkdirSync(tenantDir, { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: ISO records fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  rmSync(evidenceDir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
});

describe("record evaluation", () => {
  it("reports a missing file rather than throwing", () => {
    const spec = isoRecordSpecSchema.parse({ file: "absent.csv", kind: "csv", title: "不在" });
    const report = checkRecord("ISO-21401", spec);
    expect(report.exists).toBe(false);
    expect(report.issues).toHaveLength(1);
  });

  it("passes a well-formed record", () => {
    const errors = errorsFor(
      {
        file: "ok.csv",
        kind: "csv",
        title: "正常",
        columns: [
          { name: "id", required: true, pattern: "^RO-[0-9]{3}$" },
          { name: "score", type: "number", required: true, min: 1, max: 25 },
        ],
        rules: [{ kind: "non_empty", message: "空です" }],
      },
      "ok.csv",
      "id,score\nRO-001,12\n",
    );
    expect(errors).toEqual([]);
  });

  it("collects every fault in one pass instead of stopping at the first", () => {
    const errors = errorsFor(
      {
        file: "many.csv",
        kind: "csv",
        title: "複数不備",
        columns: [
          { name: "id", required: true },
          { name: "note", required: true },
        ],
      },
      "many.csv",
      "id,note\nx,\ny,\nz,\n",
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("flags a missing column", () => {
    const errors = errorsFor(
      { file: "c.csv", kind: "csv", title: "列欠落", columns: [{ name: "owner", required: true }] },
      "c.csv",
      "id\nRO-001\n",
    );
    expect(errors.join()).toContain("列 owner がありません");
  });

  it("flags a value outside the closed set", () => {
    const errors = errorsFor(
      {
        file: "e.csv",
        kind: "csv",
        title: "列挙",
        columns: [{ name: "status", values: ["open", "closed"] }],
      },
      "e.csv",
      "status\npending\n",
    );
    expect(errors.join()).toContain("status は open / closed");
  });

  it("flags a number out of range and a malformed date", () => {
    const errors = errorsFor(
      {
        file: "t.csv",
        kind: "csv",
        title: "型",
        columns: [
          { name: "score", type: "number", min: 1, max: 5 },
          { name: "on", type: "date" },
        ],
      },
      "t.csv",
      "score,on\n9,2026/01/01\n",
    );
    expect(errors.join()).toContain("上限 5");
    expect(errors.join()).toContain("YYYY-MM-DD");
  });

  it("flags a computed column that does not match its factors", () => {
    const errors = errorsFor(
      {
        file: "s.csv",
        kind: "csv",
        title: "計算",
        rules: [
          {
            kind: "computed",
            target: "score",
            operation: "product",
            factors: ["severity", "frequency"],
            message: "score が一致しません",
          },
        ],
      },
      "s.csv",
      "severity,frequency,score\n3,4,10\n",
    );
    expect(errors.join()).toContain("期待 12");
  });

  it("demands the dependent columns only when the condition holds", () => {
    const spec = {
      file: "cond.csv",
      kind: "csv",
      title: "条件",
      rules: [
        {
          kind: "conditional_required",
          column: "significant",
          equals: ["yes"],
          require: ["control", "objective"],
          message: "著しい側面には管理方法と目標が必要",
        },
      ],
    };
    expect(errorsFor(spec, "cond.csv", "significant,control,objective\nno,,\n")).toEqual([]);
    expect(
      errorsFor(spec, "cond.csv", "significant,control,objective\nyes,,\n").join(),
    ).toContain("未記入: control, objective");
  });

  it("flags a part exceeding its whole", () => {
    const errors = errorsFor(
      {
        file: "cmp.csv",
        kind: "csv",
        title: "比較",
        rules: [
          {
            kind: "comparison",
            left: "local_spend_yen",
            operator: "lte",
            right: "total_spend_yen",
            message: "地域調達額が総調達額を超えています",
          },
        ],
      },
      "cmp.csv",
      "local_spend_yen,total_spend_yen\n900,500\n",
    );
    expect(errors.join()).toContain("総調達額を超え");
  });

  it("treats a long-stale review as no review", () => {
    const errors = errorsFor(
      {
        file: "f.csv",
        kind: "csv",
        title: "鮮度",
        rules: [
          {
            kind: "freshness",
            column: "reviewed_on",
            max_age_days: 365,
            message: "見直しから1年以上経過",
          },
        ],
      },
      "f.csv",
      "reviewed_on\n2000-01-01\n",
    );
    expect(errors.join()).toContain("見直しから1年以上経過");
  });

  it("flags duplicate keys", () => {
    const errors = errorsFor(
      {
        file: "u.csv",
        kind: "csv",
        title: "重複",
        rules: [{ kind: "unique", columns: ["month"], message: "月が重複しています" }],
      },
      "u.csv",
      "month\n2026-01\n2026-01\n",
    );
    expect(errors.join()).toContain("月が重複しています");
  });

  it("flags an empty register", () => {
    const errors = errorsFor(
      {
        file: "n.csv",
        kind: "csv",
        title: "空",
        rules: [{ kind: "non_empty", message: "記録がありません" }],
      },
      "n.csv",
      "id,note\n",
    );
    expect(errors).toEqual(["記録がありません"]);
  });

  it("flags unreplaced placeholders and missing sections in Markdown", () => {
    const spec = {
      file: "p.md",
      kind: "markdown",
      title: "様式",
      rules: [
        { kind: "no_placeholders", message: "プレースホルダが未置換" },
        { kind: "required_sections", headings: ["適用範囲", "調達方針"], message: "節が欠けています" },
      ],
    };
    const errors = errorsFor(spec, "p.md", "# 調達\n\n## 適用範囲\n\n施設 {FACILITY_NAME}\n");
    expect(errors.join()).toContain("プレースホルダが未置換");
    expect(errors.join()).toContain("不足: 調達方針");

    expect(errorsFor(spec, "p.md", "## 適用範囲\n本館\n\n## 調達方針\n地元優先\n")).toEqual([]);
  });

  it("does not accept the document title in place of the section itself", () => {
    const spec = {
      file: "t.md",
      kind: "markdown",
      title: "様式",
      rules: [{ kind: "required_sections", headings: ["調達方針"], message: "節が欠けています" }],
    };
    const errors = errorsFor(spec, "t.md", "# 調達方針および適用範囲\n\n本文のみ\n");
    expect(errors.join()).toContain("不足: 調達方針");
  });

  it("accepts a numbered section heading", () => {
    const spec = {
      file: "n.md",
      kind: "markdown",
      title: "様式",
      rules: [{ kind: "required_sections", headings: ["労働条件"], message: "節が欠けています" }],
    };
    expect(errorsFor(spec, "n.md", "# 従業者\n\n## 3. 労働条件\n\n週休2日\n")).toEqual([]);
  });

  it("warns rather than errors when the rule says so", () => {
    writeRecord("w.csv", "reviewed_on\n2000-01-01\n");
    const spec = isoRecordSpecSchema.parse({
      file: "w.csv",
      kind: "csv",
      title: "警告",
      rules: [
        {
          kind: "freshness",
          column: "reviewed_on",
          max_age_days: 365,
          severity: "warning",
          message: "古い",
        },
      ],
    });
    const report = checkRecord("ISO-21401", spec);
    expect(report.issues.map((i) => i.severity)).toEqual(["warning"]);
    expect(invalidRecordPaths([]).size).toBe(0);
  });
});

describe("ISO-21401 record specification", () => {
  it("declares a spec for every shipped form", () => {
    const spec = loadRecordSpecs("ISO-21401");
    expect(spec).toBeDefined();
    expect(spec?.records.length).toBe(12);
  });

  it("rejects a closed corrective action with no root cause or effectiveness check", () => {
    const spec = loadRecordSpecs("ISO-21401")!;
    const ca = spec.records.find((r) => r.file === "corrective-actions.csv")!;
    writeRecord(
      "corrective-actions.csv",
      "id,raised_on,source,clause,description,immediate_action,root_cause," +
        "corrective_action,owner,due,effectiveness_checked_on,result,status\n" +
        "CA-001,2026-01-10,internal_audit,10.2,苦情,一次対応,,,山田,2026-02-01,,,closed\n",
    );
    const messages = checkRecord("ISO-21401", ca).issues.map((i) => i.message);
    expect(messages.join()).toContain("根本原因");
  });

  it("marks a failing record's path as unusable evidence", () => {
    writeRecord("kpi-log.csv", "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n");
    const invalid = invalidRecordPaths(["ISO-21401"]);
    expect(invalid.has("docs/compliance/iso/ISO-21401/kpi-log.csv")).toBe(true);
  });

  it("renders a summary an operator can act on", () => {
    const text = formatRecordReports(checkRecordsForStandard("ISO-21401"));
    expect(text).toContain("記録の内容検査");
    expect(text).toContain("kpi-log.csv");
  });

  it("resolves record paths under the tenant compliance folder", () => {
    const spec = loadRecordSpecs("ISO-21401")!;
    expect(recordRelPath("ISO-21401", spec.records[0])).toMatch(
      /^docs\/compliance\/iso\/ISO-21401\//,
    );
  });
});

describe("KPI computation after moving structure checks to the spec", () => {
  it("computes intensity and month-on-month change", () => {
    writeRecord(
      "kpi-log.csv",
      "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n" +
        "2026-01,100,50,1000,20,30,\n" +
        "2026-02,200,60,1800,30,50,\n",
    );
    const report = buildKpiReport("docs/compliance/iso/ISO-21401/kpi-log.csv");
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].intensity.garbage_kg).toBeCloseTo(0.5);
    expect(report.rows[1].intensity.garbage_kg).toBeCloseTo(0.3);
    expect(report.rows[1].change.garbage_kg).toBeCloseTo(-0.4);
  });

  it("skips rows it cannot compute from instead of duplicating the spec's complaints", () => {
    writeRecord(
      "kpi-log.csv",
      "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n" +
        "2026-13,100,50,1000,20,30,\n" +
        "2026-01,100,abc,1000,20,30,\n" +
        "2026-02,100,10,100,5,5,\n",
    );
    const report = buildKpiReport("docs/compliance/iso/ISO-21401/kpi-log.csv");
    expect(report.skipped).toBe(2);
    expect(report.rows).toHaveLength(1);
    expect(report.errors).toEqual([]);
  });

  it("still refuses to derive intensity from a month with no guest nights", () => {
    writeRecord(
      "kpi-log.csv",
      "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n" +
        "2026-01,0,50,1000,20,30,\n",
    );
    const report = buildKpiReport("docs/compliance/iso/ISO-21401/kpi-log.csv");
    expect(report.errors.join()).toContain("原単位を計算できません");
    expect(report.rows[0].intensity.garbage_kg).toBeNull();
  });

  it("leaves the empty-log complaint to the record spec", () => {
    writeRecord("kpi-log.csv", "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n");
    expect(buildKpiReport("docs/compliance/iso/ISO-21401/kpi-log.csv").errors).toEqual([]);
    const kpi = loadRecordSpecs("ISO-21401")!.records.find((r) => r.file === "kpi-log.csv")!;
    expect(checkRecord("ISO-21401", kpi).issues.map((i) => i.message).join()).toContain(
      "測定記録がありません",
    );
  });
});

describe("yaml records", () => {
  it("treats an empty list as missing evidence", () => {
    const spec = isoRecordSpecSchema.parse({
      file: "ledgers.yaml",
      kind: "yaml",
      title: "台帳",
      tenant_path: "data/medical-device/ledgers/ledgers.yaml",
      list_key: "entries",
      rules: [{ kind: "non_empty", message: "件がありません" }],
    });
    mkdirSync(join(tenantDir, "data/medical-device/ledgers"), { recursive: true });
    writeFileSync(join(tenantDir, "data/medical-device/ledgers/ledgers.yaml"), "version: \"1\"\nentries: []\n", "utf-8");
    const report = checkRecord("ISO-13485", spec);
    expect(report.exists).toBe(true);
    expect(report.rows).toBe(0);
    expect(report.issues.map((i) => i.message).join()).toContain("件がありません");
  });

  it("passes a yaml list with at least one entry", () => {
    const spec = isoRecordSpecSchema.parse({
      file: "ledgers.yaml",
      kind: "yaml",
      title: "台帳",
      tenant_path: "data/medical-device/ledgers/ledgers.yaml",
      list_key: "entries",
      rules: [{ kind: "non_empty", message: "件がありません" }],
    });
    mkdirSync(join(tenantDir, "data/medical-device/ledgers"), { recursive: true });
    writeFileSync(
      join(tenantDir, "data/medical-device/ledgers/ledgers.yaml"),
      "version: \"1\"\nentries:\n  - id: BAT-001\n",
      "utf-8",
    );
    expect(checkRecord("ISO-13485", spec).issues).toEqual([]);
  });
});

describe("pack records registers", () => {
  it("keeps ISO-21401 at least 12 record specs", () => {
    expect(loadRecordSpecs("ISO-21401")!.records.length).toBeGreaterThanOrEqual(12);
  });

  it("ships a filled records.yaml for every available pack", () => {
    for (const id of listAvailableIsoIds()) {
      const specs = loadRecordSpecs(id)?.records ?? [];
      expect(specs.length, `${id} records empty`).toBeGreaterThan(0);
    }
  });

  it("gives every records.yaml file without tenant_path a pack or core template", () => {
    for (const id of listAvailableIsoIds()) {
      for (const spec of loadRecordSpecs(id)?.records ?? []) {
        if (spec.tenant_path) continue;
        const pack = join(packTemplatesDir(id), spec.file);
        const core = join(CORE_TEMPLATES_DIR, spec.file);
        expect(existsSync(pack) || existsSync(core), `${id}/${spec.file} has no template`).toBe(true);
      }
    }
  });

  it("binds 13485 evidence to jp_medical_device ledgers", () => {
    const specs = loadRecordSpecs("ISO-13485")!.records;
    expect(specs.some((s) => s.tenant_path?.includes("data/medical-device/ledgers/"))).toBe(true);
  });

  it("names domain records for environment, OHS, energy, BCM, ITSM and bribery packs", () => {
    expect(loadRecordSpecs("ISO-14001")!.records.some((r) => r.file.includes("aspect"))).toBe(true);
    expect(loadRecordSpecs("ISO-45001")!.records.some((r) => r.file.includes("hazard"))).toBe(true);
    expect(loadRecordSpecs("ISO-50001")!.records.some((r) => r.file.includes("enpi"))).toBe(true);
    expect(loadRecordSpecs("ISO-22301")!.records.some((r) => r.file.includes("bia"))).toBe(true);
    expect(loadRecordSpecs("ISO-20000")!.records.some((r) => r.file.includes("sla"))).toBe(true);
    expect(loadRecordSpecs("ISO-37001")!.records.some((r) => r.file.includes("bribery"))).toBe(true);
    expect(loadRecordSpecs("ISO-22000")!.records.some((r) => r.file === "applicability.md")).toBe(true);
  });
});
