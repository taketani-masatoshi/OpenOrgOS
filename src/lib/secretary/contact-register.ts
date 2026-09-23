import { existsSync } from "node:fs";
import { join } from "node:path";
import { currentDate, getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import {
  externalContactsFileSchema,
  stakeholdersFileSchema,
  type ExternalContact,
} from "../../../schemas/executive.js";
import {
  contactTextIncludes,
  externalContactsPath,
  loadExternalContactsFile,
} from "./contact-sources.js";

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

function nextExternalContactId(contacts: ExternalContact[]): string {
  let max = 0;
  for (const c of contacts) {
    const m = c.id.match(/^EXT-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `EXT-${String(max + 1).padStart(3, "0")}`;
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
        contactTextIncludes(c.name, input.name) &&
        (!input.org || contactTextIncludes(c.org, input.org))
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
  if (
    stakeholderId &&
    existsSync(stakeholdersPath) &&
    (input.email || input.role || input.department)
  ) {
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
        contact: input.email ? { ...stk.contact, email: input.email } : stk.contact,
      };
      writeYamlFile(stakeholdersPath, stakeholdersFileSchema.parse(stakeholders));
      stakeholderSynced = true;
    }
  }

  return { extId, created, stakeholderSynced, contact };
}
