/**
 * External specialists (lawyer / tax / technical advisor) for Operator Console.
 * Canonical: data/company.yaml `advisors`. Never emit email, address, or L2.
 */
import type { Company, CompanyAdvisor, CompanyAdvisorKind } from "../../../schemas/company.js";

export const CONSOLE_ADVISOR_KINDS = ["legal", "tax", "technical"] as const;
export type ConsoleAdvisorKind = (typeof CONSOLE_ADVISOR_KINDS)[number];

export type CompanyOrgAdvisorStatus = "engaged" | "none";

export interface CompanyOrgAdvisorRow {
  kind: ConsoleAdvisorKind;
  status: CompanyOrgAdvisorStatus;
  name?: string;
  firm?: string;
  note?: string;
  contract_id?: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ADDRESS_RE = /〒|\d{3}-\d{4}/;

function redactPublicText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(EMAIL_RE, "")
    .replace(ADDRESS_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || undefined;
}

function isVacantAdvisorText(text: string): boolean {
  const value = text.trim();
  if (!value) return true;
  if (/^(なし|未契約|未定|none|n\/a|—|-)$/i.test(value)) return true;
  return /^(なし|未契約)[（(]/.test(value);
}

/** Parse legacy one-line company.yaml fields such as `legal_advisor`. */
export function parseAdvisorText(raw: string | undefined): {
  status: CompanyOrgAdvisorStatus;
  name?: string;
  firm?: string;
} {
  const text = raw?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || isVacantAdvisorText(text)) return { status: "none" };
  const wrapped = text.match(/^(.+?)[（(](.+?)[）)]$/u);
  if (wrapped) {
    const name = redactPublicText(wrapped[1]);
    const firm = redactPublicText(wrapped[2]);
    if (!name || isVacantAdvisorText(name)) return { status: "none" };
    return { status: "engaged", name, firm };
  }
  const name = redactPublicText(text);
  if (!name) return { status: "none" };
  return { status: "engaged", name };
}

function rowFromListed(listed: CompanyAdvisor): CompanyOrgAdvisorRow {
  if (listed.status === "none") {
    return {
      kind: listed.kind,
      status: "none",
      note: redactPublicText(listed.note),
    };
  }
  return {
    kind: listed.kind,
    status: "engaged",
    name: redactPublicText(listed.name),
    firm: redactPublicText(listed.firm),
    note: redactPublicText(listed.note),
    contract_id: listed.contract_id?.trim() || undefined,
  };
}

function legacyField(company: Company, kind: CompanyAdvisorKind): string | undefined {
  switch (kind) {
    case "legal":
      return company.legal_advisor;
    case "tax":
      return company.tax_advisor;
    case "technical":
      return company.technical_advisor;
  }
}

/**
 * Always three Console slots (legal / tax / technical).
 * `advisors` wins over one-line aliases when the kind is listed.
 */
export function buildCompanyAdvisors(company: Company): CompanyOrgAdvisorRow[] {
  const listed = new Map(
    (company.advisors ?? []).map((row) => [row.kind, row] as const)
  );
  return CONSOLE_ADVISOR_KINDS.map((kind) => {
    const fromList = listed.get(kind);
    if (fromList) return rowFromListed(fromList);
    const parsed = parseAdvisorText(legacyField(company, kind));
    return parsed.status === "none"
      ? { kind, status: "none" }
      : { kind, status: "engaged", name: parsed.name, firm: parsed.firm };
  });
}
