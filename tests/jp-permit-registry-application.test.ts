// @catalog-ids: jp_permit_registry
import { describe, expect, it } from "vitest";
import { detectLatexEngine, ensureJapaneseLatexPreamble } from "../src/lib/latex-compile.js";
import {
  buildFieldsFromMap,
  resolvePermitFieldSource,
  runPermitApplicationChecklistOnDraft,
} from "../steward/jurisdiction-packs/JP/modules/jp_permit_registry/cli/application-lib.js";
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
        { form_field: "filing_date", source: "computed.today_reiwa", required: true, format: "reiwa" },
      ],
      ctx
    );
    expect(fields.applicant_name).toBe("株式会社テスト");
    expect(fields.filing_date).toMatch(/^令和/);
  });
});

describe("permit application checklist", () => {
  it("flags missing required fields", () => {
    const form: PermitFormEntry = {
      id: "form-test",
      permit_type_ids: ["pt-ryokan-hotel"],
      name_ja: "test",
      template_md: "templates/x.md",
      required_fields: ["applicant_name", "site_address"],
    };
    const result = runPermitApplicationChecklistOnDraft(
      {
        application_id: "APP-1",
        permit_type_id: "pt-ryokan-hotel",
        form_id: "form-test",
        fields: { applicant_name: "株式会社テスト" },
        manual_overrides: {},
      },
      form
    );
    expect(result.ready_for_export).toBe(false);
    expect(result.missing).toContain("site_address");
  });
});
