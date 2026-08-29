/**
 * L0 company officers from data/company.yaml (public corporate identity).
 * Names of registered directors are in-scope. Never emit address or other L2 fields.
 */
import { loadCompany } from "./data.js";
import type { Company, Director } from "../../schemas/company.js";

export type CompanyOfficersCoverage = "registered" | "unregistered";

export interface CompanyOfficer {
  name: string;
  role: string;
}

export interface CompanyOfficersView {
  company_name: string;
  source_path: string;
  coverage: CompanyOfficersCoverage;
  officers: CompanyOfficer[];
  notes: string[];
}

const ADDRESS_LIKE = /〒|\d{3}-\d{4}|東京都|北海道|京都府|大阪府|[^\s]{1,4}[都道府県]/u;

function looksLikeAddress(value: string): boolean {
  return ADDRESS_LIKE.test(value);
}

function splitRepresentativeNames(raw: string): string[] {
  return raw
    .split(/[、,，]/u)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0 && !looksLikeAddress(part));
}

function isRepresentativeRole(role: string | undefined): boolean {
  if (!role?.trim()) return false;
  return /代表取締役|代表社員|representative\s*director/iu.test(role);
}

export function extractCompanyOfficers(company: Company): CompanyOfficer[] {
  const fromDirectors = (company.directors ?? [])
    .map((d: Director) => ({
      name: d.name.trim(),
      role: (d.role ?? "代表取締役").trim() || "代表取締役",
    }))
    .filter((d) => d.name.length > 0 && !looksLikeAddress(d.name));

  const representatives = fromDirectors.filter((d) => isRepresentativeRole(d.role));
  if (representatives.length > 0) return representatives;
  if (fromDirectors.length > 0) return fromDirectors;

  const fallback = company.representative?.trim();
  if (!fallback || looksLikeAddress(fallback)) return [];
  return splitRepresentativeNames(fallback).map((name) => ({
    name,
    role: "代表取締役",
  }));
}

function resignationNote(company: Company): string | undefined {
  const res = company.governance_status?.director_resignation;
  if (!res?.person?.trim()) return undefined;
  const bits = [
    `${res.person.trim()}は辞任手続中`,
    res.status === "pending_registration" ? "登記完了まで取締役欄は現状維持" : undefined,
  ].filter(Boolean);
  return bits.join("。");
}

export function buildCompanyOfficersView(): CompanyOfficersView {
  const company = loadCompany();
  const officers = extractCompanyOfficers(company);
  const notes: string[] = [];
  const resign = resignationNote(company);
  if (resign) notes.push(resign);

  return {
    company_name: company.name,
    source_path: "data/company.yaml",
    coverage: officers.length > 0 ? "registered" : "unregistered",
    officers,
    notes,
  };
}

/** Short CEO-facing reply — names and roles only. */
export function formatCompanyOfficersCeoReply(view: CompanyOfficersView): string {
  if (view.coverage === "unregistered" || view.officers.length === 0) {
    return "未登録";
  }
  const names = view.officers.map((o) => o.name).join("、");
  const roles = new Set(view.officers.map((o) => o.role));
  const roleLabel = roles.size === 1 ? [...roles][0] : "取締役";
  const lines = [`${view.company_name}の${roleLabel}は${names}です。`];
  if (view.notes[0]) lines.push(view.notes[0] + "。");
  return lines.join("\n");
}

export function formatCompanyOfficersTodayLines(view: CompanyOfficersView): string[] {
  if (view.coverage === "unregistered") {
    return [
      `- 代表取締役: 未登録`,
      `- Path: \`${view.source_path}\``,
    ];
  }
  const names = view.officers.map((o) => `${o.name}（${o.role}）`).join("、");
  const lines = [
    `- 商号: ${view.company_name}`,
    `- 代表取締役: ${names}`,
    `- Path: \`${view.source_path}\``,
  ];
  for (const note of view.notes) {
    lines.push(`- 注記: ${note}`);
  }
  return lines;
}
