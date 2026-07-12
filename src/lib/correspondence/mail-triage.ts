import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import type {
  MailDisposition,
  MailImportance,
  MailRouting,
  MailTriageEntry,
  MailUrgency,
} from "../../../schemas/correspondence/mail-triage.js";
import type {
  MailTriageRuleSet,
  MailTriageRules,
} from "../../../schemas/correspondence/mail-triage-rules.js";
import { currentDate } from "../utils.js";
import { loadMailTriageRules } from "./mail-triage-rules.js";
import {
  loadMailTriageQueue,
  saveMailTriageQueue,
  upsertTriageEntry,
  isHighPriorityEntry,
} from "./mail-triage-queue.js";
import { identifySenderForTriageEntry } from "./sender-identification.js";
import { postTriageInterpretAndCeoAsk } from "./mail-triage-interpret.js";
import { getMailReceivedDir } from "./paths.js";
import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

export interface ParsedMailHeaders {
  from: string;
  subject: string;
  messageId?: string;
  receivedAt: string;
  textPreview: string;
}

export interface TriageResult {
  entry: MailTriageEntry;
}

export interface TriageBatchResult {
  processed: number;
  highPriorityIds: string[];
  notified: number;
}

function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function matchKeyword(text: string, keywords?: string[]): string[] {
  if (!keywords?.length) return [];
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function matchPattern(text: string, patterns?: string[]): string[] {
  if (!patterns?.length) return [];
  const hits: string[] = [];
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern).test(text)) hits.push(pattern);
    } catch {
      // invalid regex in tenant rules — skip
    }
  }
  return hits;
}

function matchRuleSet(
  rules: MailTriageRuleSet | undefined,
  from: string,
  subject: string,
  prefix: string
): string[] {
  if (!rules) return [];
  const hits: string[] = [];
  const email = extractEmailAddress(from);
  const domain = extractDomain(email);
  const text = `${from} ${subject}`;

  for (const addr of rules.from_addresses ?? []) {
    if (email === addr.toLowerCase()) hits.push(`${prefix}:from_address:${addr}`);
  }
  for (const dom of rules.from_domains ?? []) {
    if (domain.includes(dom.toLowerCase()) || email.includes(dom.toLowerCase())) {
      hits.push(`${prefix}:from_domain:${dom}`);
    }
  }
  for (const kw of matchKeyword(text, rules.subject_keywords)) {
    hits.push(`${prefix}:subject_keyword:${kw}`);
  }
  for (const pat of matchPattern(subject, rules.subject_patterns)) {
    hits.push(`${prefix}:subject_pattern:${pat}`);
  }
  return hits;
}

function pickImportance(hits: string[]): MailImportance {
  if (hits.some((h) => h.startsWith("importance:p0"))) return "p0";
  if (hits.some((h) => h.startsWith("importance:p1"))) return "p1";
  if (hits.some((h) => h.startsWith("importance:p3"))) return "p3";
  if (hits.some((h) => h.startsWith("importance:p2"))) return "p2";
  return "p2";
}

function pickUrgency(hits: string[]): MailUrgency {
  if (hits.some((h) => h.startsWith("urgency:immediate"))) return "immediate";
  if (hits.some((h) => h.startsWith("urgency:today"))) return "today";
  if (hits.some((h) => h.startsWith("urgency:week"))) return "week";
  return "none";
}

export function classifyMail(
  parsed: ParsedMailHeaders,
  rules: MailTriageRules = loadMailTriageRules()
): Omit<MailTriageEntry, "id" | "eml_ref" | "handoff_status"> {
  const hits: string[] = [];

  hits.push(...matchRuleSet(rules.spam, parsed.from, parsed.subject, "spam"));
  hits.push(...matchRuleSet(rules.suspicious, parsed.from, parsed.subject, "suspicious"));

  for (const level of ["p0", "p1", "p2", "p3"] as const) {
    hits.push(
      ...matchRuleSet(rules.importance?.[level], parsed.from, parsed.subject, `importance:${level}`)
    );
  }
  for (const level of ["immediate", "today", "week"] as const) {
    hits.push(
      ...matchRuleSet(rules.urgency?.[level], parsed.from, parsed.subject, `urgency:${level}`)
    );
  }

  let disposition: MailDisposition = "ham";
  if (hits.some((h) => h.startsWith("spam:"))) disposition = "spam";
  else if (hits.some((h) => h.startsWith("suspicious:"))) disposition = "suspicious";
  else if (hits.length === 0) disposition = "unknown";

  const importance = pickImportance(hits);
  const urgency = pickUrgency(hits);

  let routing: MailRouting;
  const routingRules = rules.routing;
  if (disposition === "spam") {
    routing =
      routingRules?.spam === "archive"
        ? "archive"
        : routingRules?.spam === "secretary"
          ? "secretary"
          : "ignore";
  } else if (disposition === "suspicious") {
    routing =
      routingRules?.suspicious === "ignore"
        ? "ignore"
        : routingRules?.suspicious === "secretary"
          ? "secretary"
          : "archive";
  } else if (importance === "p0") {
    routing = routingRules?.p0_ham === "ignore" ? "ignore" : "secretary";
  } else {
    routing =
      routingRules?.default_ham === "archive"
        ? "archive"
        : routingRules?.default_ham === "ignore"
          ? "ignore"
          : "secretary";
  }

  return {
    source_message_id: parsed.messageId,
    mail_thread_ids: [],
    received_at: parsed.receivedAt,
    from: parsed.from,
    subject: parsed.subject,
    importance,
    urgency,
    disposition,
    routing,
    rule_hits: hits,
    triaged_at: new Date().toISOString(),
    sender_known: false,
  };
}

export async function parseEmlHeaders(emlPath: string): Promise<ParsedMailHeaders> {
  const raw = readFileSync(emlPath, "utf-8");
  const parsed = await simpleParser(raw);
  const from = parsed.from?.text ?? "unknown";
  const subject = parsed.subject ?? "(no subject)";
  const text = (parsed.text ?? "").slice(0, 500);
  return {
    from,
    subject,
    messageId: parsed.messageId,
    receivedAt: parsed.date?.toISOString() ?? new Date().toISOString(),
    textPreview: text,
  };
}

function messageIdFromFilename(filename: string): string {
  return filename.replace(/\.eml$/, "");
}

function buildEntryId(filename: string, parsed: ParsedMailHeaders): string {
  const base = messageIdFromFilename(filename);
  if (base.startsWith("MSG-")) return base;
  const day = currentDate().replace(/-/g, "");
  const hash = createHash("sha256")
    .update(parsed.messageId ?? `${parsed.from}:${parsed.subject}`)
    .digest("hex")
    .slice(0, 8);
  return `MSG-${day}-${hash}`;
}

export async function triageEmlFile(
  filename: string,
  opts?: { identifySender?: boolean }
): Promise<TriageResult> {
  const emlPath = join(getMailReceivedDir(), filename);
  const parsed = await parseEmlHeaders(emlPath);
  const classified = classifyMail(parsed);
  const id = buildEntryId(filename, parsed);
  const eml_ref = `records/executive/mail-received/${filename}`;

  const queue = loadMailTriageQueue();
  const existing = queue.entries.find(
    (e) => e.eml_ref === eml_ref || e.source_message_id === parsed.messageId
  );

  let entry = upsertTriageEntry({
    id: existing?.id ?? id,
    ...classified,
    handoff_status: existing?.handoff_status ?? "pending",
    eml_ref,
    notified_at: existing?.notified_at,
    handoff_ref: existing?.handoff_ref,
    sender_email: existing?.sender_email,
    sender_known: existing?.sender_known ?? false,
    sender_contact_ref: existing?.sender_contact_ref,
    sender_scope: existing?.sender_scope,
    identification_status: existing?.identification_status,
    scheduling_case_id: existing?.scheduling_case_id,
    schedule_reply_parsed: existing?.schedule_reply_parsed,
    mail_thread_ids: existing?.mail_thread_ids ?? [],
  });

  if (opts?.identifySender !== false) {
    const identified = await identifySenderForTriageEntry(entry, {
      skipCeoAsk: Boolean(existing?.identification_status),
    });
    entry = identified.triage;
  }

  entry = await postTriageInterpretAndCeoAsk(entry);

  return { entry };
}

export async function triageUnprocessedMail(opts?: {
  identifySender?: boolean;
}): Promise<TriageBatchResult> {
  const queue = loadMailTriageQueue();
  const queuedRefs = new Set(queue.entries.map((e) => e.eml_ref));
  const dir = getMailReceivedDir();
  if (!existsSync(dir)) {
    return { processed: 0, highPriorityIds: [], notified: 0 };
  }

  const files = readdirSync(dir).filter((n) => n.endsWith(".eml"));
  const highPriorityIds: string[] = [];
  let processed = 0;

  for (const file of files) {
    const ref = `records/executive/mail-received/${file}`;
    if (queuedRefs.has(ref)) continue;
    const { entry } = await triageEmlFile(file, { identifySender: opts?.identifySender });
    processed += 1;
    if (isHighPriorityEntry(entry) && !entry.notified_at) {
      highPriorityIds.push(entry.id);
    }
  }

  return { processed, highPriorityIds, notified: 0 };
}

export function overrideTriageEntry(
  id: string,
  patch: Partial<
    Pick<MailTriageEntry, "importance" | "urgency" | "disposition" | "routing" | "handoff_status">
  >
): MailTriageEntry | undefined {
  const queue = loadMailTriageQueue();
  const idx = queue.entries.findIndex((e) => e.id === id);
  if (idx < 0) return undefined;
  const updated = { ...queue.entries[idx], ...patch };
  queue.entries[idx] = updated;
  saveMailTriageQueue(queue);
  return updated;
}
