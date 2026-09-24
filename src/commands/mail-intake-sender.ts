/** Mail intake — unknown sender identification CLI. */
import {
  identifySenderForTriageEntry,
  confirmSenderFromCeo,
  registerConfirmedSender,
  listSenderIdentificationPending,
  formatSenderIdentificationReport,
} from "../lib/correspondence/sender-identification.js";
import {
  findSenderIdentification,
  loadSenderIdentificationQueue,
} from "../lib/correspondence/sender-identification-queue.js";
import { findTriageEntry } from "../lib/correspondence/mail-triage-queue.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export async function runMailIntakeSenderIdentify(opts: {
  id: string;
  skipWebSearch?: boolean;
  skipCeoAsk?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const entry = findTriageEntry(opts.id);
  if (!entry) {
    console.error(`Triage entry not found: ${opts.id}`);
    process.exit(1);
  }
  const result = await identifySenderForTriageEntry(entry, {
    skipWebSearch: opts.skipWebSearch,
    skipCeoAsk: opts.skipCeoAsk,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Sender identification: ${result.action}`);
  if (result.identification) {
    console.log(formatSenderIdentificationReport(result.identification));
  }
}

export function runMailIntakeSenderList(opts: { pending?: boolean; json?: boolean }): void {
  const all = opts.pending
    ? listSenderIdentificationPending()
    : loadSenderIdentificationQueue().entries;
  if (opts.json) {
    console.log(JSON.stringify(all, null, 2));
    return;
  }
  if (!all.length) {
    console.log("（送信者特定キューなし）");
    return;
  }
  for (const e of all) {
    console.log(formatSenderIdentificationReport(e));
    console.log("---");
  }
}

export function runMailIntakeSenderConfirm(opts: {
  id: string;
  name: string;
  org?: string;
  department?: string;
  role?: string;
  relationship?: string;
  notes?: string;
  webSearchTrusted?: boolean;
  operator?: string;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "mail intake sender confirm", permission: "escalate:plan" });
  auditCliMutation("mail intake sender confirm", "confirm");
  const identification = confirmSenderFromCeo({
    mailId: opts.id,
    name: opts.name,
    org: opts.org,
    department: opts.department,
    role: opts.role,
    relationship: opts.relationship,
    notes: opts.notes,
    webSearchTrusted: opts.webSearchTrusted,
    confirmedBy: opts.operator,
  });
  if (opts.json) {
    console.log(JSON.stringify(identification, null, 2));
    return;
  }
  console.log(`✓ CEO 確認済み: ${opts.name}`);
  console.log(`  次: npm run orgos -- mail intake sender register --id ${opts.id}`);
}

export function runMailIntakeSenderRegister(opts: { id: string; json?: boolean }): void {
  requireCliDataWrite({ command: "mail intake sender register", permission: "escalate:plan" });
  auditCliMutation("mail intake sender register", "register");
  const result = registerConfirmedSender(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ 登録完了: ${result.extId}`);
}

export function runMailIntakeSenderShow(opts: { id: string; json?: boolean }): void {
  const identification = findSenderIdentification(opts.id);
  if (!identification) {
    console.error(`Sender identification not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(identification, null, 2));
    return;
  }
  console.log(formatSenderIdentificationReport(identification));
}
