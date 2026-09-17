import { beforeEach, describe, expect, it } from "vitest";
import { companySchema } from "../schemas/company.js";
import { loadCompany } from "../src/lib/data.js";
import { loadOrgChart } from "../src/lib/org/org-chart.js";
import {
  buildCompanyAdvisors,
  parseAdvisorText,
} from "../src/lib/steward-chat/company-advisors.js";
import { buildCompanyOrgView } from "../src/lib/steward-chat/company-org-table.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("company org view (MAL)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("groups units and shows login readiness without secrets", () => {
    const chart = loadOrgChart();
    expect(chart).toBeTruthy();
    const company = loadCompany();
    const ceoName = company.directors?.[0]?.name;
    expect(ceoName).toBeTruthy();
    const { units, users, advisors } = buildCompanyOrgView(chart!);

    const reps = units.find((u) => u.unit_label === "代表取締役");
    const ceo = reps?.members.find((m) => m.name === ceoName);
    expect(ceo?.login_id_ready).toBe(true);
    expect(ceo?.operator_id).toBe("OP-001");
    expect(ceo?.role).toBe("ceo");
    expect(ceo?.rights).toContain("approve");
    expect(ceo?.community_login_ready).toBe(true);

    const coRep = reps?.members.find((m) => m.name !== ceoName);
    expect(coRep?.login_id_ready).toBe(false);
    expect(coRep?.note).toMatch(/辞任手続中/);

    const biz = units.find((u) => u.unit_label === "事業部門")?.members[0];
    expect(biz?.login_id_ready).toBe(true);
    expect(biz?.operator_id).toBe("OP-003");
    expect(biz?.role).toBe("employee");

    const admin = units.find((u) => u.unit_label === "管理部門");
    expect(admin?.vacant).toBe(false);
    expect(admin?.members[0]?.login_id_ready).toBe(true);
    expect(admin?.members[0]?.operator_id).toBe("OP-004");

    expect(users.some((u) => u.name === ceoName && u.operator_id === "OP-001")).toBe(true);
    expect(users.some((u) => u.operator_id === "OP-003")).toBe(true);

    const legal = advisors.find((a) => a.kind === "legal");
    expect(legal?.status).toBe("engaged");
    expect(legal?.contract_id).toBe("CTR-022");
    expect(legal?.name).toBeTruthy();
    expect(legal?.firm).toBeTruthy();
    expect(advisors.find((a) => a.kind === "tax")?.status).toBe("none");
    expect(advisors.find((a) => a.kind === "technical")?.status).toBe("none");

    const blob = JSON.stringify({ units, users, advisors });
    expect(blob).not.toMatch(/〒|千代田区|BANK-|k\.lab\.masa|sha256:|credential_id|@|EXT-005/);
  });
});

describe("parseAdvisorText", () => {
  it("treats vacant phrases as none", () => {
    expect(parseAdvisorText(undefined)).toEqual({ status: "none" });
    expect(parseAdvisorText("なし（未契約）")).toEqual({ status: "none" });
    expect(parseAdvisorText("未契約")).toEqual({ status: "none" });
  });

  it("splits name and firm from fullwidth parentheses", () => {
    expect(parseAdvisorText("佐藤一郎（サンプル法律事務所）")).toEqual({
      status: "engaged",
      name: "佐藤一郎",
      firm: "サンプル法律事務所",
    });
  });

  it("strips emails from legacy text", () => {
    const parsed = parseAdvisorText("山田太郎（example@firm.example）");
    expect(parsed.status).toBe("engaged");
    expect(parsed.name).toBe("山田太郎");
    expect(parsed.firm).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toMatch(/@/);
  });
});

describe("buildCompanyAdvisors", () => {
  it("always returns legal / tax / technical slots", () => {
    const rows = buildCompanyAdvisors({ name: "デモ株式会社" });
    expect(rows.map((r) => r.kind)).toEqual(["legal", "tax", "technical"]);
    expect(rows.every((r) => r.status === "none")).toBe(true);
  });

  it("prefers advisors list over one-line aliases", () => {
    const rows = buildCompanyAdvisors({
      name: "テスト株式会社",
      legal_advisor: "別名（別事務所）",
      advisors: [
        {
          kind: "legal",
          status: "engaged",
          name: "佐藤一郎",
          firm: "サンプル法律事務所",
          contract_id: "CTR-022",
          contact_id: "EXT-005",
          note: "CEO確認",
        },
      ],
    });
    const legal = rows.find((r) => r.kind === "legal");
    expect(legal).toMatchObject({
      status: "engaged",
      name: "佐藤一郎",
      firm: "サンプル法律事務所",
      contract_id: "CTR-022",
    });
    expect(JSON.stringify(rows)).not.toMatch(/EXT-005|@/);
  });

  it("falls back to one-line aliases when advisors omits a kind", () => {
    const rows = buildCompanyAdvisors({
      name: "テスト株式会社",
      tax_advisor: "なし（未契約）",
      technical_advisor: "佐藤（技術顧問室）",
    });
    expect(rows.find((r) => r.kind === "tax")?.status).toBe("none");
    expect(rows.find((r) => r.kind === "technical")).toMatchObject({
      status: "engaged",
      name: "佐藤",
      firm: "技術顧問室",
    });
  });

  it("reads MAL lawyer from company.yaml without secrets", () => {
    setTenantId("mal");
    const company = loadCompany();
    const rows = buildCompanyAdvisors(company);
    const legal = rows.find((r) => r.kind === "legal");
    expect(legal?.status).toBe("engaged");
    expect(legal?.contract_id).toBe("CTR-022");
    expect(legal?.name).toBeTruthy();
    expect(legal?.firm).toBeTruthy();
    expect(rows.find((r) => r.kind === "tax")?.status).toBe("none");
    expect(rows.find((r) => r.kind === "technical")?.status).toBe("none");
    expect(JSON.stringify(rows)).not.toMatch(/@|EXT-005|〒|mmn-law/);
  });

  it("rejects engaged advisor without a name", () => {
    const parsed = companySchema.safeParse({
      name: "テスト株式会社",
      advisors: [{ kind: "legal", status: "engaged" }],
    });
    expect(parsed.success).toBe(false);
  });
});
