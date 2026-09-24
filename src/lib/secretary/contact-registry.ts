import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { loadStakeholdersIfExists } from "../stakeholders.js";
import { getDataDir } from "../utils.js";
import type { ExternalContact } from "../../../schemas/executive.js";
import {
  collectContactRegistryCandidates,
  contactTextIncludes,
  loadExternalContactsFile,
  normalizeContactText,
  type ContactLookupMatch,
} from "./contact-sources.js";

export type { ContactLookupMatch, ContactRegistryScope } from "./contact-sources.js";
export { collectContactRegistryCandidates } from "./contact-sources.js";
export { registerContact, type RegisterContactInput, type RegisterContactResult } from "./contact-register.js";

export interface ContactLookupQuery {
  name?: string;
  org?: string;
  department?: string;
  extId?: string;
  stakeholderId?: string;
}

export interface ContactLookupResult {
  query: ContactLookupQuery;
  matches: ContactLookupMatch[];
  ambiguous: boolean;
  found: boolean;
}

export function getExternalContactById(extId: string): ExternalContact | undefined {
  const file = loadExternalContactsFile();
  return file.contacts.find((c) => c.id === extId);
}

/**
 * A stored ref carries its file: `data/executive/external-contacts.yaml#EXT-001`.
 * Callers also pass the bare id, so accept either.
 */
function externalContactIdFromRef(contactRef: string): string {
  return contactRef.match(/\bEXT-\d+\b/i)?.[0]?.toUpperCase() ?? contactRef;
}

export function resolveEmailFromContactRef(contactRef: string): string | undefined {
  const ext = getExternalContactById(externalContactIdFromRef(contactRef));
  if (ext?.email) return ext.email;
  if (ext?.stakeholder_id) {
    const stk = loadStakeholdersIfExists()?.stakeholders.find((s) => s.id === ext.stakeholder_id);
    return stk?.representative_contact?.email ?? stk?.contact?.email ?? undefined;
  }
  return undefined;
}

export function verifyRecipientInRegistry(email: string): {
  verified: boolean;
  match?: ContactLookupMatch;
} {
  const resolved = resolveSenderByEmail(email);
  if (!resolved.known || !resolved.match) return { verified: false };
  return { verified: true, match: resolved.match };
}

export interface SenderResolution {
  known: boolean;
  match?: ContactLookupMatch;
  ambiguous?: boolean;
  matches?: ContactLookupMatch[];
  internal_domain?: boolean;
}

/** メール差出人を contact registry 全体から照合（email 優先 · displayName フォールバック） */
export function resolveSenderByEmail(email: string, displayName?: string): SenderResolution {
  const candidates = collectContactRegistryCandidates();
  const emailNorm = normalizeContactText(email);
  const emailMatches = candidates.filter(
    (m) => m.email && normalizeContactText(m.email) === emailNorm
  );
  if (emailMatches.length === 1) return { known: true, match: emailMatches[0] };
  if (emailMatches.length > 1) {
    return { known: true, ambiguous: true, matches: emailMatches, match: emailMatches[0] };
  }

  if (displayName?.trim()) {
    const nameMatches = filterMatches(candidates, { name: displayName.trim() });
    if (nameMatches.length === 1) return { known: true, match: nameMatches[0] };
    if (nameMatches.length > 1) {
      return { known: true, ambiguous: true, matches: nameMatches, match: nameMatches[0] };
    }
  }

  return { known: false };
}

/**
 * Addresses the company itself sends from — the officer list only covers named
 * people, so a tenant that declares just a representative address still needs
 * its own mail recognised as ours.
 */
export function isOwnMailAddress(email: string): boolean {
  const target = normalizeContactText(email);
  if (!target) return false;
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return false;
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as {
      public_disclosure?: { representative_email?: string; contact_email?: string };
    };
    return [doc.public_disclosure?.representative_email, doc.public_disclosure?.contact_email]
      .filter(Boolean)
      .some((own) => normalizeContactText(own as string) === target);
  } catch {
    return false;
  }
}

function filterMatches(
  candidates: ContactLookupMatch[],
  query: ContactLookupQuery
): ContactLookupMatch[] {
  return candidates.filter((c) => {
    if (query.extId && c.ref !== query.extId) return false;
    if (query.stakeholderId && c.stakeholder_id !== query.stakeholderId) return false;
    if (query.name && !contactTextIncludes(c.name, query.name)) return false;
    if (
      query.org &&
      !(contactTextIncludes(c.org, query.org) || contactTextIncludes(c.notes, query.org))
    )
      return false;
    if (
      query.department &&
      !(
        contactTextIncludes(c.department, query.department) ||
        contactTextIncludes(c.role, query.department) ||
        contactTextIncludes(c.notes, query.department)
      )
    )
      return false;
    return true;
  });
}

export function resolveContactRegistry(query: ContactLookupQuery): ContactLookupResult {
  const candidates = collectContactRegistryCandidates();
  const matches = filterMatches(candidates, query);
  const unique = matches.filter(
    (m, i, arr) =>
      arr.findIndex(
        (x) => x.ref === m.ref && x.source === m.source && x.email === m.email && x.name === m.name
      ) === i
  );
  return {
    query,
    matches: unique,
    ambiguous: unique.length > 1,
    found: unique.length > 0,
  };
}

export function formatContactLookupReport(result: ContactLookupResult): string {
  const lines: string[] = [];
  if (!result.found) {
    lines.push("正本に該当する連絡先は見つかりませんでした。");
    lines.push(
      "推測せず、人間に確認するか、開示された情報で `orgos secretary contacts register` を実行してください。"
    );
    return lines.join("\n");
  }
  if (result.ambiguous) {
    lines.push(
      `複数候補 (${result.matches.length} 件) — 用途・部署を確認してから選択してください。`
    );
  } else {
    lines.push("1 件一致:");
  }
  for (const m of result.matches) {
    lines.push(
      `- [${m.scope}] ${m.name} · ${m.org ?? "—"} · ${m.role ?? m.department ?? "—"} · email: ${m.email ?? "未登録"} · ${m.source}#${m.ref}`
    );
  }
  return lines.join("\n");
}
