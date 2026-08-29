import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { loadExternalContacts } from "../data.js";
import { loadStakeholdersIfExists } from "../stakeholders.js";
import { currentDate, getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { getTenantsDir } from "../orgos-paths.js";
import {
  externalContactsFileSchema,
  oneOnOnesFileSchema,
  stakeholdersFileSchema,
  type ExternalContact,
  type ExternalContactsFile,
} from "../../../schemas/executive.js";
import { employeesFileSchema } from "../../../schemas/hr.js";
import {
  peerTenantCompanyYamlPath,
  peerTenantExternalContactsPath,
  tenantIdFromPeerOrgUri,
} from "./peer-contact-policy.js";

export type ContactRegistryScope = "self" | "counterparty" | "peer_tenant";

export interface ContactLookupQuery {
  name?: string;
  org?: string;
  department?: string;
  extId?: string;
  stakeholderId?: string;
}

export interface ContactLookupMatch {
  scope: ContactRegistryScope;
  source: string;
  ref: string;
  name: string;
  org?: string;
  department?: string;
  role?: string;
  email?: string;
  stakeholder_id?: string;
  peer_tenant_id?: string;
  notes?: string;
}

export interface ContactLookupResult {
  query: ContactLookupQuery;
  matches: ContactLookupMatch[];
  ambiguous: boolean;
  found: boolean;
}

function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function includesNorm(hay: string | undefined, needle: string | undefined): boolean {
  if (!hay || !needle) return false;
  return norm(hay).includes(norm(needle)) || norm(needle).includes(norm(hay));
}

function loadOneOnOneContacts(): ContactLookupMatch[] {
  const path = join(getDataDir(), "executive", "one-on-ones.yaml");
  if (!existsSync(path)) return [];
  try {
    const file = readYamlFile(path, oneOnOnesFileSchema);
    return file.one_on_ones.map((o) => ({
      scope: "self" as const,
      source: "data/executive/one-on-ones.yaml",
      ref: o.id,
      name: o.person,
      department: o.role,
      role: o.role,
    }));
  } catch {
    return [];
  }
}

function loadInternalEmployees(): ContactLookupMatch[] {
  const path = join(getDataDir(), "hr", "employees.yaml");
  if (!existsSync(path)) return [];
  try {
    const file = readYamlFile(path, employeesFileSchema);
    return file.employees
      .filter((e) => e.status === "active")
      .map((e) => ({
        scope: "self" as const,
        source: "data/hr/employees.yaml",
        ref: e.id,
        name: e.name,
        role: e.job_type ?? undefined,
        department: e.job_type ?? undefined,
      }));
  } catch {
    return [];
  }
}

function externalContactsPath(): string {
  return join(getDataDir(), "executive", "external-contacts.yaml");
}

function loadExternalContactsFile(): ExternalContactsFile {
  const path = externalContactsPath();
  if (!existsSync(path)) return { contacts: [] };
  return readYamlFile(path, externalContactsFileSchema);
}

function nextExternalContactId(contacts: ExternalContact[]): string {
  let max = 0;
  for (const c of contacts) {
    const m = c.id.match(/^EXT-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `EXT-${String(max + 1).padStart(3, "0")}`;
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
    return (
      stk?.representative_contact?.email ??
      stk?.contact?.email ??
      undefined
    );
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
  const emailNorm = norm(email);
  const emailMatches = candidates.filter((m) => m.email && norm(m.email) === emailNorm);
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

function loadCompanyOfficers(): ContactLookupMatch[] {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return [];
  const doc = YAML.parse(readFileSync(path, "utf-8")) as {
    name?: string;
    representative?: string;
    directors?: Array<{ name: string; role?: string }>;
    public_disclosure?: { representative_email?: string; contact_email?: string };
  };
  const out: ContactLookupMatch[] = [];
  const selfOrg = doc.name;
  const repEmail =
    doc.public_disclosure?.representative_email ?? doc.public_disclosure?.contact_email;
  if (doc.representative) {
    for (const person of doc.representative.split(/[、,]/)) {
      const name = person.trim();
      if (!name) continue;
      out.push({
        scope: "self",
        source: "data/company.yaml",
        ref: "representative",
        name,
        org: selfOrg,
        role: "代表",
        email: repEmail,
      });
    }
  }
  for (const d of doc.directors ?? []) {
    out.push({
      scope: "self",
      source: "data/company.yaml",
      ref: `directors.${d.name}`,
      name: d.name,
      org: selfOrg,
      role: d.role,
    });
  }
  return out;
}

function loadProtocolPeers(): Array<{ peer_id: string; display_name: string; org_uri?: string }> {
  const path = join(getDataDir(), "protocol", "peers.yaml");
  if (!existsSync(path)) return [];
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as {
      peers?: Array<{ peer_id: string; display_name: string; org_uri?: string }>;
    };
    return doc.peers ?? [];
  } catch {
    return [];
  }
}

function tenantIdFromOrgUri(orgUri?: string): string | undefined {
  return tenantIdFromPeerOrgUri(orgUri);
}

function loadPeerTenantContacts(tenantId: string): ContactLookupMatch[] {
  // Policy: folder_access_policy §2.8.1 — L1 only; caller must gate via loadProtocolPeers() + org_uri.
  const base = join(getTenantsDir(), tenantId);
  const out: ContactLookupMatch[] = [];

  const companyPath = peerTenantCompanyYamlPath(tenantId);
  if (existsSync(companyPath)) {
    const doc = YAML.parse(readFileSync(companyPath, "utf-8")) as {
      name?: string;
      representative?: string;
      public_disclosure?: { representative_email?: string; billing_email?: string };
    };
    const repEmail = doc.public_disclosure?.representative_email;
    if (doc.representative) {
      for (const person of doc.representative.split(/[、,]/)) {
        const name = person.trim();
        if (!name) continue;
        out.push({
          scope: "peer_tenant",
          source: `tenants/${tenantId}/data/company.yaml`,
          ref: "representative",
          name,
          org: doc.name,
          role: "代表取締役",
          email: repEmail,
          peer_tenant_id: tenantId,
        });
      }
    }
  }

  const extPath = peerTenantExternalContactsPath(tenantId);
  if (existsSync(extPath)) {
    const file = readYamlFile(extPath, externalContactsFileSchema);
    for (const c of file.contacts) {
      out.push({
        scope: "peer_tenant",
        source: `tenants/${tenantId}/data/executive/external-contacts.yaml`,
        ref: c.id,
        name: c.name,
        org: c.org,
        department: c.department,
        role: c.role,
        email: c.email,
        stakeholder_id: c.stakeholder_id,
        peer_tenant_id: tenantId,
        notes: c.notes,
      });
    }
  }
  return out;
}

function filterMatches(
  candidates: ContactLookupMatch[],
  query: ContactLookupQuery
): ContactLookupMatch[] {
  return candidates.filter((c) => {
    if (query.extId && c.ref !== query.extId) return false;
    if (query.stakeholderId && c.stakeholder_id !== query.stakeholderId) return false;
    if (query.name && !includesNorm(c.name, query.name)) return false;
    if (query.org && !(includesNorm(c.org, query.org) || includesNorm(c.notes, query.org)))
      return false;
    if (
      query.department &&
      !(
        includesNorm(c.department, query.department) ||
        includesNorm(c.role, query.department) ||
        includesNorm(c.notes, query.department)
      )
    )
      return false;
    return true;
  });
}

export function collectContactRegistryCandidates(): ContactLookupMatch[] {
  const out: ContactLookupMatch[] = [];

  out.push(...loadCompanyOfficers());
  out.push(...loadOneOnOneContacts());
  out.push(...loadInternalEmployees());

  try {
    const ext = loadExternalContacts();
    for (const c of ext.contacts) {
      out.push({
        scope: c.org?.includes("自社") ? "self" : "counterparty",
        source: "data/executive/external-contacts.yaml",
        ref: c.id,
        name: c.name,
        org: c.org,
        department: c.department,
        role: c.role,
        email: c.email,
        stakeholder_id: c.stakeholder_id,
        notes: c.notes,
      });
    }
  } catch {
    // optional file
  }

  const stakeholders = loadStakeholdersIfExists();
  for (const s of stakeholders?.stakeholders ?? []) {
    const rep = s.representative_contact;
    if (rep) {
      out.push({
        scope: "counterparty",
        source: "data/executive/stakeholders.yaml",
        ref: `${s.id}.representative_contact`,
        name: rep.name,
        org: s.org ?? s.name,
        department: rep.department,
        role: rep.role,
        email: rep.email,
        stakeholder_id: s.id,
        notes: s.notes,
      });
    }
    if (s.contact?.email) {
      out.push({
        scope: "counterparty",
        source: "data/executive/stakeholders.yaml",
        ref: `${s.id}.contact`,
        name: s.name,
        org: s.org ?? undefined,
        email: s.contact.email ?? undefined,
        stakeholder_id: s.id,
        notes: s.notes,
      });
    }
  }

  for (const peer of loadProtocolPeers()) {
    const tenantId = tenantIdFromPeerOrgUri(peer.org_uri);
    if (!tenantId) continue;
    if (!existsSync(join(getTenantsDir(), tenantId, "tenant.yaml"))) continue;
    out.push(...loadPeerTenantContacts(tenantId));
  }

  return out;
}

export function resolveContactRegistry(query: ContactLookupQuery): ContactLookupResult {
  const candidates = collectContactRegistryCandidates();
  const matches = filterMatches(candidates, query);
  const unique = matches.filter(
    (m, i, arr) =>
      arr.findIndex(
        (x) =>
          x.ref === m.ref &&
          x.source === m.source &&
          x.email === m.email &&
          x.name === m.name
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
    lines.push("推測せず、人間に確認するか、開示された情報で `orgos secretary contacts register` を実行してください。");
    return lines.join("\n");
  }
  if (result.ambiguous) {
    lines.push(`複数候補 (${result.matches.length} 件) — 用途・部署を確認してから選択してください。`);
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

export interface RegisterContactInput {
  extId?: string;
  name: string;
  email?: string;
  org?: string;
  department?: string;
  role?: string;
  relationship?: string;
  stakeholderId?: string;
  notes?: string;
  source?: string;
}

export interface RegisterContactResult {
  extId: string;
  created: boolean;
  stakeholderSynced: boolean;
  contact: ExternalContact;
}

export function registerContact(input: RegisterContactInput): RegisterContactResult {
  if (!input.name.trim()) {
    throw new Error("register requires --name");
  }

  const file = loadExternalContactsFile();
  let extId = input.extId;
  let idx = extId ? file.contacts.findIndex((c) => c.id === extId) : -1;
  let created = false;

  if (idx < 0 && !extId) {
    const match = file.contacts.find(
      (c) =>
        includesNorm(c.name, input.name) &&
        (!input.org || includesNorm(c.org, input.org))
    );
    if (match) {
      extId = match.id;
      idx = file.contacts.findIndex((c) => c.id === extId);
    }
  }

  if (!extId) {
    extId = nextExternalContactId(file.contacts);
    created = true;
  }

  const existing = idx >= 0 ? file.contacts[idx]! : undefined;
  const contact: ExternalContact = {
    id: extId,
    name: input.name,
    org: input.org ?? existing?.org,
    department: input.department ?? existing?.department,
    relationship: input.relationship ?? existing?.relationship,
    role: input.role ?? existing?.role,
    email: input.email ?? existing?.email,
    stakeholder_id: input.stakeholderId ?? existing?.stakeholder_id,
    notes: input.notes ?? existing?.notes,
  };

  const nextContacts = [...file.contacts];
  if (idx >= 0) {
    nextContacts[idx] = contact;
  } else {
    nextContacts.push(contact);
  }

  const parsed = externalContactsFileSchema.parse({ ...file, contacts: nextContacts });
  writeYamlFile(externalContactsPath(), parsed);

  let stakeholderSynced = false;
  const stakeholderId = contact.stakeholder_id;
  const stakeholdersPath = join(getDataDir(), "executive", "stakeholders.yaml");
  if (stakeholderId && existsSync(stakeholdersPath) && (input.email || input.role || input.department)) {
    const stakeholders = readYamlFile(stakeholdersPath, stakeholdersFileSchema);
    const sIdx = stakeholders.stakeholders.findIndex((s) => s.id === stakeholderId);
    if (sIdx >= 0) {
      const stk = stakeholders.stakeholders[sIdx]!;
      const rep = stk.representative_contact ?? {
        name: contact.name,
        registered_at: currentDate(),
        source: input.source ?? "secretary contacts register",
      };
      stakeholders.stakeholders[sIdx] = {
        ...stk,
        representative_contact: {
          ...rep,
          name: contact.name,
          role: input.role ?? rep.role,
          department: input.department ?? rep.department,
          email: input.email ?? rep.email,
          registered_at: rep.registered_at ?? currentDate(),
          source: input.source ?? rep.source ?? "secretary contacts register",
        },
        contact: input.email
          ? { ...stk.contact, email: input.email }
          : stk.contact,
      };
      writeYamlFile(stakeholdersPath, stakeholdersFileSchema.parse(stakeholders));
      stakeholderSynced = true;
    }
  }

  return { extId, created, stakeholderSynced, contact };
}
