import {
  formatContactLookupReport,
  registerContact,
  resolveContactRegistry,
  resolveEmailFromContactRef,
  verifyRecipientInRegistry,
} from "../lib/secretary/contact-registry.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export interface ContactsResolveCliOptions {
  name?: string;
  org?: string;
  department?: string;
  extId?: string;
  stakeholderId?: string;
  json?: boolean;
}

export function runContactsResolve(opts: ContactsResolveCliOptions): void {
  const result = resolveContactRegistry({
    name: opts.name,
    org: opts.org,
    department: opts.department,
    extId: opts.extId,
    stakeholderId: opts.stakeholderId,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatContactLookupReport(result));
  if (!result.found) process.exit(1);
  if (result.ambiguous) process.exit(2);
}

export interface ContactsRegisterCliOptions {
  name: string;
  email?: string;
  org?: string;
  department?: string;
  role?: string;
  relationship?: string;
  extId?: string;
  stakeholderId?: string;
  notes?: string;
  source?: string;
  dryRun?: boolean;
  json?: boolean;
}

export function runContactsRegister(opts: ContactsRegisterCliOptions): void {
  if (!opts.name) {
    console.error("Provide --name");
    process.exit(1);
  }

  if (opts.dryRun) {
    const preview = resolveContactRegistry({
      name: opts.name,
      org: opts.org,
      department: opts.department,
      extId: opts.extId,
      stakeholderId: opts.stakeholderId,
    });
    if (opts.json) {
      console.log(JSON.stringify({ dryRun: true, existing: preview }, null, 2));
      return;
    }
    console.log("dry-run — 既存照合:");
    console.log(formatContactLookupReport(preview));
    return;
  }

  requireCliDataWrite({ command: "secretary contacts register", permission: "escalate:plan" });

  const result = registerContact({
    extId: opts.extId,
    name: opts.name,
    email: opts.email,
    org: opts.org,
    department: opts.department,
    role: opts.role,
    relationship: opts.relationship,
    stakeholderId: opts.stakeholderId,
    notes: opts.notes,
    source: opts.source ?? "human_disclosure",
  });

  auditCliMutation("secretary contacts register", result.extId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`✓ ${result.extId} ${result.created ? "created" : "updated"}`);
  if (result.contact.email) console.log(`  email: ${result.contact.email}`);
  if (result.stakeholderSynced) console.log(`  stakeholders.yaml: representative_contact synced`);
  console.log("  next: npm run orgos -- validate");
}

export function resolveContactRefForDraft(opts: {
  contactRef?: string;
  to?: string;
}): { to?: string; warnings: string[] } {
  const warnings: string[] = [];
  let to = opts.to;

  if (opts.contactRef) {
    const email = resolveEmailFromContactRef(opts.contactRef);
    if (email) {
      if (to && normEmail(to) !== normEmail(email)) {
        warnings.push(
          `--to (${to}) が --contact-ref ${opts.contactRef} の正本 (${email}) と一致しません`
        );
      } else if (!to) {
        to = email;
      }
    } else {
      warnings.push(`--contact-ref ${opts.contactRef} に email が未登録です`);
    }
  }

  if (to) {
    const verified = verifyRecipientInRegistry(to);
    if (!verified.verified) {
      warnings.push(
        `宛先 ${to} は正本未登録です。推測送信を避け、人間確認後に orgos secretary contacts register を実行してください`
      );
    }
  }

  return { to, warnings };
}

function normEmail(email: string): string {
  return email.normalize("NFKC").toLowerCase().trim();
}
