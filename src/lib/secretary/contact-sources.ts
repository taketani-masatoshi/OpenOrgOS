import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { loadExternalContacts } from "../data.js";
import { loadStakeholdersIfExists } from "../stakeholders.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { getTenantsDir } from "../orgos-paths.js";
import {
  externalContactsFileSchema,
  oneOnOnesFileSchema,
  type ExternalContactsFile,
} from "../../../schemas/executive.js";
import { employeesFileSchema } from "../../../schemas/hr.js";
import {
  peerTenantCompanyYamlPath,
  peerTenantExternalContactsPath,
  tenantIdFromPeerOrgUri,
} from "./peer-contact-policy.js";

export type ContactRegistryScope = "self" | "counterparty" | "peer_tenant";

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

export function normalizeContactText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function contactTextIncludes(hay: string | undefined, needle: string | undefined): boolean {
  if (!hay || !needle) return false;
  const h = normalizeContactText(hay);
  const n = normalizeContactText(needle);
  return h.includes(n) || n.includes(h);
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

export function externalContactsPath(): string {
  return join(getDataDir(), "executive", "external-contacts.yaml");
}

export function loadExternalContactsFile(): ExternalContactsFile {
  const path = externalContactsPath();
  if (!existsSync(path)) return { contacts: [] };
  return readYamlFile(path, externalContactsFileSchema);
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

function loadPeerTenantContacts(tenantId: string): ContactLookupMatch[] {
  // Policy: folder_access_policy §2.8.1 — L1 only; caller must gate via loadProtocolPeers() + org_uri.
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
