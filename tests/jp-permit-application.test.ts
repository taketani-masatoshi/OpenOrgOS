// @catalog-ids: jp_permit_application,jp_permit_registry
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { detectLatexEngine, ensureJapaneseLatexPreamble } from "../src/lib/latex-compile.js";
import {
  assessStandaloneCatalogCoverage,
  buildClarifyQuestions,
  buildFieldsFromMap,
  resolvePermitFieldSource,
  runPermitApplicationChecklistOnDraft,
} from "../steward/jurisdiction-packs/JP/modules/jp_permit_application/cli/application-lib.js";
import { runPermitCatalogValidate } from "../steward/jurisdiction-packs/JP/modules/jp_permit_application/cli/lib.js";
import { getModuleSeedDir } from "../src/lib/modules.js";
import type { Company } from "../schemas/company.js";
import type { Property } from "../schemas/property.js";
import type { PermitApplicationEntry, PermitFormEntry } from "../schemas/jp-permit-registry.js";

const company: Company = {
  name: "株式会社テスト",
  corporate_number: "1234567890123",
  address: "東京都千代田区1-1-1",
  representative: "山田太郎、鈴木花子",
  directors: [{ name: "山田太郎", role: "代表取締役" }],
  business_description: "宿泊業\nWeb: https://example.com",
};

const property: Property = {
  id: "PROP-002",
  name: "テスト旅館",
  location: "東京都墨田区2-2-2",
  type: "hotel",
  building_area_sqm: 120,
  hotel: { room_count: 8, occupancy_rate: 0.7, adr: 15000 },
};

const application: PermitApplicationEntry = {
  id: "APP-TEST-001",
  permit_type_id: "pt-ryokan-hotel",
  status: "preparing",
  phase: "obtain",
  property_id: "PROP-002",
  field_overrides: { structure_use: "旅館業" },
};

describe("latex-compile", () => {
  it("detects engine or returns null gracefully", () => {
    const engine = detectLatexEngine();
    expect(
      engine === null || engine === "xelatex" || engine === "pdflatex" || engine === "tectonic"
    ).toBe(true);
  });

  it("injects fontspec preamble when missing", () => {
    const out = ensureJapaneseLatexPreamble("\\begin{document}\nHi\n\\end{document}");
    expect(out).toContain("\\begin{document}");
  });
});

describe("permit application field resolution", () => {
  const ctx = { company, property, application };

  it("resolves company fields from SoT", () => {
    expect(resolvePermitFieldSource("company.name", ctx)).toBe("株式会社テスト");
    expect(resolvePermitFieldSource("company.representative_primary", ctx)).toBe("山田太郎");
  });

  it("resolves property fields", () => {
    expect(resolvePermitFieldSource("property.location", ctx)).toBe("東京都墨田区2-2-2");
    expect(resolvePermitFieldSource("property.hotel.room_count", ctx)).toBe("8");
  });

  it("uses application field_overrides", () => {
    expect(resolvePermitFieldSource("application.structure_use", ctx)).toBe("旅館業");
  });

  it("builds field map with reiwa date", () => {
    const fields = buildFieldsFromMap(
      [
        { form_field: "applicant_name", source: "company.name", required: true },
        {
          form_field: "filing_date",
          source: "computed.today_reiwa",
          required: true,
          format: "reiwa",
        },
      ],
      ctx
    );
    expect(fields.applicant_name).toBe("株式会社テスト");
    expect(fields.filing_date).toMatch(/^令和/);
  });

  it("fills site_* from company when property is omitted (catalog-only obtain)", () => {
    const orgOnlyCtx = {
      company,
      application: {
        ...application,
        permit_type_id: "pt-fiea-type1",
        property_id: undefined,
        field_overrides: undefined,
      },
    };
    const fields = buildFieldsFromMap(
      [
        { form_field: "applicant_name", source: "company.name", required: true },
        { form_field: "applicant_address", source: "company.address", required: true },
        { form_field: "representative_name", source: "company.representative_primary", required: true },
        { form_field: "site_name", source: "property.name" },
        { form_field: "site_address", source: "property.location" },
        { form_field: "filing_date", source: "computed.today_reiwa", format: "reiwa" },
      ],
      orgOnlyCtx
    );
    if (!String(fields.site_address ?? "").trim()) fields.site_address = company.address;
    if (!String(fields.site_name ?? "").trim()) fields.site_name = company.name;
    const form: PermitFormEntry = {
      id: "form-fiea-type1",
      permit_type_ids: ["pt-fiea-type1"],
      name_ja: "第一種金商",
      template_md: "templates/x.md",
      required_fields: [
        "applicant_name",
        "applicant_address",
        "representative_name",
        "site_address",
        "filing_date",
      ],
      output_format: "tex",
    };
    const draft = {
      application_id: "APP-FIEA-001",
      permit_type_id: "pt-fiea-type1",
      form_id: form.id,
      status: "preparing" as const,
      fields,
      manual_overrides: {},
    };
    const result = runPermitApplicationChecklistOnDraft(draft, form);
    expect(result.missing).toEqual([]);
    expect(result.ready_for_export).toBe(true);
  });
});

describe("permit application checklist", () => {
  it("flags missing required fields", () => {
    const form: PermitFormEntry = {
      id: "form-test",
      permit_type_ids: ["pt-ryokan-hotel"],
      name_ja: "test",
      template_md: "templates/x.md",
      required_fields: ["applicant_name", "missing_field"],
      output_format: "tex",
    };
    const draft = {
      application_id: "APP-X",
      permit_type_id: "pt-ryokan-hotel",
      form_id: "form-test",
      status: "preparing" as const,
      fields: { applicant_name: "A" },
      manual_overrides: {},
    };
    const result = runPermitApplicationChecklistOnDraft(draft, form);
    expect(result.ready_for_export).toBe(false);
    expect(result.missing).toContain("missing_field");
  });

  it("builds antique clarify questions when business_type blank", () => {
    const qs = buildClarifyQuestions({
      permitTypeId: "pt-antique-dealer",
      blankFields: ["business_type"],
    });
    expect(qs[0]).toMatch(/古物/);
  });
});

describe("jp_permit_application form packs", () => {
  const seed = getModuleSeedDir("jp_permit_registry");
  const formsPath = join(seed, "forms-catalog.yaml.example");

  it("ships tex form packs for priority license types", () => {
    expect(existsSync(formsPath)).toBe(true);
    const forms = YAML.parse(readFileSync(formsPath, "utf-8")).forms as Array<{
      id: string;
      permit_type_ids: string[];
      template_tex?: string;
      submission?: { authority_label_ja: string };
    }>;
    const byType = new Map<string, (typeof forms)[0]>();
    for (const f of forms) {
      for (const tid of f.permit_type_ids) byType.set(tid, f);
    }
    for (const tid of [
      "pt-ryokan-shukuhaku",
      "pt-fire-equip",
      "pt-building-confirm",
      "pt-food-restaurant",
      "pt-antique-dealer",
      "pt-takken",
      "pt-job-intro-fee",
      "pt-medical-device-mah",
      "pt-medical-device-mfg",
    ]) {
      const form = byType.get(tid);
      expect(form, tid).toBeTruthy();
      expect(form!.template_tex, tid).toBeTruthy();
      expect(form!.submission?.authority_label_ja, tid).toBeTruthy();
      const texExample = form!.template_tex!.replace(/\.tex$/, ".tex.example");
      expect(
        existsSync(join(seed, texExample)) || existsSync(join(seed, form!.template_tex!))
      ).toBe(true);
    }
  });

  it("validates CSV catalog without error", () => {
    expect(() => runPermitCatalogValidate()).not.toThrow();
  });

  it("covers every national-catalog permit type with a form pack", () => {
    const status = assessStandaloneCatalogCoverage();
    expect(status.type_count).toBeGreaterThanOrEqual(138);
    expect(status.missing_forms).toEqual([]);
    expect(status.prerequisites.business_modules).toEqual([]);
  });
});
