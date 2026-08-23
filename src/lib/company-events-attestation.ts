import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  companyEventsAttestationSchema,
  type CompanyEventsAttestation,
} from "../../schemas/company-events-attestation.js";
import {
  loadCompanyEventChain,
  validateCompanyEventChainWithRegistry,
  verifyCompanyEventChain,
} from "./company-events-chain.js";
import { loadCompanyEvents } from "./company-events.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";
import {
  ensureCompanyEventsSigningKey,
  signAttestationPayload,
  verifyAttestationSignature,
} from "./company-events-signing.js";
import { currentDate, getDataDir, toLogicalPath, writeMarkdownReport } from "./utils.js";
import { loadNotificationsRegistry } from "./notifications/push.js";
import { pinCompanyEventChainTail, verifyCompanyEventsWitnessPin } from "./company-events-witness-pin.js";
import { getTenantId } from "./tenant.js";
import { sendWebhook } from "./webhook.js";

const ATTESTATIONS_PATH = () => join(getDataDir(), "company-events-attestations.jsonl");

export function companyEventsAttestationsPath(): string {
  return toLogicalPath(ATTESTATIONS_PATH());
}

export function loadCompanyEventsAttestations(): CompanyEventsAttestation[] {
  return loadJsonl(ATTESTATIONS_PATH(), (raw) => companyEventsAttestationSchema.parse(raw));
}

export function getISOWeekParts(date = new Date()): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function weeklyAttestationId(date = new Date()): string {
  const { year, week } = getISOWeekParts(date);
  return `CEA-${year}-W${String(week).padStart(2, "0")}`;
}

function weekPeriodBounds(date = new Date()): { start: string; end: string } {
  const local = new Date(date);
  const day = local.getDay();
  const monday = new Date(local);
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(local.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export interface ChainIntegrityResult {
  ok: boolean;
  issues: Array<{ code: string; message: string }>;
  chain_checked: number;
}

export function assertCompanyEventsChainIntegrity(): ChainIntegrityResult {
  const chain = verifyCompanyEventChain();
  const registry = loadCompanyEvents();
  const cross = validateCompanyEventChainWithRegistry(registry);
  const issues = [...chain.issues, ...cross.issues];
  const ok = chain.ok && cross.ok;
  if (!ok) {
    const summary = issues.map((i) => `${i.code}: ${i.message}`).join("; ");
    throw new Error(`Company events chain integrity check failed: ${summary}`);
  }
  return { ok, issues, chain_checked: chain.checked };
}

export interface WeeklyAttestationResult {
  attestation: CompanyEventsAttestation;
  path: string;
  skipped?: boolean;
}

export function runWeeklyCompanyEventsAttestation(opts?: {
  date?: Date;
  force?: boolean;
}): WeeklyAttestationResult {
  const date = opts?.date ?? new Date();
  const attestationId = weeklyAttestationId(date);
  const existing = loadCompanyEventsAttestations().find((a) => a.attestation_id === attestationId);
  if (existing && !opts?.force) {
    return { attestation: existing, path: companyEventsAttestationsPath(), skipped: true };
  }

  const integrity = assertCompanyEventsChainIntegrity();
  const chain = loadCompanyEventChain();
  const tail = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const prev = loadCompanyEventsAttestations().at(-1);
  const linksSincePrev = prev?.chain_tail_seq != null && tail ? tail.seq - prev.chain_tail_seq : tail?.seq ?? 0;
  const period = weekPeriodBounds(date);
  const registry = loadCompanyEvents();

  const payload = {
    attestation_id: attestationId,
    attestation_type: "weekly_batch" as const,
    period_start: period.start,
    period_end: period.end,
    chain_verified_at: new Date().toISOString(),
    chain_ok: integrity.ok,
    chain_checked: integrity.chain_checked,
    chain_tail_seq: tail?.seq,
    chain_tail_digest: tail?.digest,
    chain_tail_link_id: tail?.link_id,
    links_since_prev: Math.max(0, linksSincePrev),
    prev_attestation_id: prev?.attestation_id,
    registry_event_count: registry.events.length,
  };

  ensureCompanyEventsSigningKey();
  const signed = signAttestationPayload(payload);
  const attestation = companyEventsAttestationSchema.parse({
    ...payload,
    payload_digest: signed.payload_digest,
    signature: signed.signature,
    public_key: signed.public_key,
    signed_at: new Date().toISOString(),
  });

  mkdirSync(join(ATTESTATIONS_PATH(), ".."), { recursive: true });
  appendJsonl(ATTESTATIONS_PATH(), attestation);
  try {
    pinCompanyEventChainTail({ hubId: "weekly-attest" });
  } catch {
    /* empty chain or pin optional until first event */
  }
  return { attestation, path: companyEventsAttestationsPath() };
}

export function verifyCompanyEventsAttestation(record: CompanyEventsAttestation): boolean {
  const { signature, public_key, payload_digest, signed_at, ...rest } = record;
  void signed_at;
  void signature;
  void public_key;
  void payload_digest;
  return verifyAttestationSignature({
    payload: rest,
    payload_digest: record.payload_digest,
    signature: record.signature,
    public_key: record.public_key,
  });
}

export interface MonthlyAuditFinding {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
}

export interface MonthlyAuditResult {
  ok: boolean;
  month: string;
  findings: MonthlyAuditFinding[];
  attestations_in_period: CompanyEventsAttestation[];
  chain_checked: number;
  report_path?: string;
  notification_sent: boolean;
}

function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month (use YYYY-MM): ${month}`);
  }
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y!, m!, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function runMonthlyCompanyEventsAudit(opts?: {
  month?: string;
  notify?: boolean;
  output?: string;
}): Promise<MonthlyAuditResult> {
  const month = opts?.month ?? currentDate().slice(0, 7);
  const bounds = monthBounds(month);
  const findings: MonthlyAuditFinding[] = [];

  let chainChecked = 0;
  try {
    const integrity = assertCompanyEventsChainIntegrity();
    chainChecked = integrity.chain_checked;
    findings.push({
      severity: "info",
      code: "chain-ok",
      message: `Hash chain verified (${integrity.chain_checked} links)`,
    });
  } catch (e) {
    findings.push({
      severity: "error",
      code: "chain-failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const attestations = loadCompanyEventsAttestations().filter(
    (a) => a.period_start.slice(0, 7) === month || a.period_end.slice(0, 7) === month
  );

  for (const att of attestations) {
    if (!verifyCompanyEventsAttestation(att)) {
      findings.push({
        severity: "error",
        code: "attestation-signature-invalid",
        message: `Attestation ${att.attestation_id} signature verification failed`,
      });
    }
  }

  const weeklyExpected = 4;
  if (attestations.length < weeklyExpected) {
    findings.push({
      severity: "warn",
      code: "weekly-attestations-low",
      message: `Only ${attestations.length} weekly attestation(s) in ${month} (expected ~${weeklyExpected})`,
    });
  } else {
    findings.push({
      severity: "info",
      code: "weekly-attestations-ok",
      message: `${attestations.length} weekly attestation(s) recorded in ${month}`,
    });
  }

  if (attestations.length === 0) {
    findings.push({
      severity: "error",
      code: "weekly-attestations-missing",
      message: `No weekly attestations found for ${month}`,
    });
  }

  const pin = verifyCompanyEventsWitnessPin();
  if (!pin.ok) {
    findings.push({
      severity: "error",
      code: pin.code ?? "witness-pin-mismatch",
      message: pin.message ?? "Witness pin does not match chain tail",
    });
  } else if (pin.pin) {
    findings.push({
      severity: "info",
      code: "witness-pin-ok",
      message: `Witness pin matches chain tail ${pin.pin.chain_tail_digest.slice(0, 12)}… (seq ${pin.pin.chain_tail_seq})`,
    });
  }

  const ok = !findings.some((f) => f.severity === "error");
  const lines = [
    `# Company Events Monthly Audit — ${month}`,
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Agent:** records_audit`,
    `**Period:** ${bounds.start} — ${bounds.end}`,
    `**Result:** ${ok ? "PASS" : "FAIL"}`,
    "",
    "## Chain integrity",
    "",
    `- Links checked: ${chainChecked}`,
    "",
    "## Weekly attestations",
    "",
    `| ID | Period | Tail seq | Links since prev | Signed at |`,
    `|----|--------|----------|------------------|-----------|`,
  ];
  for (const att of attestations) {
    lines.push(
      `| ${att.attestation_id} | ${att.period_start} — ${att.period_end} | ${att.chain_tail_seq ?? "—"} | ${att.links_since_prev} | ${att.signed_at.slice(0, 10)} |`
    );
  }
  if (!attestations.length) {
    lines.push("| — | — | — | — | — |");
  }
  lines.push("", "## Findings", "");
  for (const f of findings) {
    lines.push(`- **[${f.severity}]** \`${f.code}\` — ${f.message}`);
  }
  lines.push(
    "",
    "## Next actions",
    "",
    "- Weekly: `orgos skills run company-events-weekly-attest`",
    "- Chain only: `orgos events chain verify`",
    "- Notify test: `orgos notifications test --event company_events_monthly_audit`",
    ""
  );

  const reportPath = writeMarkdownReport(
    "agent-summaries/records-audit",
    opts?.output ?? `monthly-audit-${month}.md`,
    lines.join("\n")
  );

  let notificationSent = false;
  if (opts?.notify !== false) {
    notificationSent = await pushMonthlyAuditNotification({
      month,
      ok,
      findings,
      report_path: reportPath,
      attestations_count: attestations.length,
    });
  }

  return {
    ok,
    month,
    findings,
    attestations_in_period: attestations,
    chain_checked: chainChecked,
    report_path: reportPath,
    notification_sent: notificationSent,
  };
}

export async function pushMonthlyAuditNotification(input: {
  month: string;
  ok: boolean;
  findings: MonthlyAuditFinding[];
  report_path: string;
  attestations_count: number;
}): Promise<boolean> {
  const event = "company_events_monthly_audit";
  const registry = loadNotificationsRegistry();
  const errors = input.findings.filter((f) => f.severity === "error").length;
  const warnings = input.findings.filter((f) => f.severity === "warn").length;
  const summary = [
    `会社イベント月次監査 ${input.month}: ${input.ok ? "PASS" : "FAIL"}`,
    `週次署名 ${input.attestations_count} 件 · error ${errors} · warn ${warnings}`,
    `Report: ${input.report_path}`,
  ].join("\n");

  const payload = {
    event,
    tenant: getTenantId(),
    month: input.month,
    ok: input.ok,
    summary,
    report_path: input.report_path,
    attestations_count: input.attestations_count,
    errors,
    warnings,
    findings: input.findings,
  };

  let sent = false;
  const webhook = registry.channels?.webhook;
  if (webhook?.url && (!webhook.events.length || webhook.events.includes(event))) {
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhook.secret ? { "X-Steward-Secret": webhook.secret } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) sent = true;
    } catch {
      // ignore
    }
  } else {
    const fallback = await sendWebhook(event, payload);
    if (fallback.sent) sent = true;
  }

  const ow = registry.channels?.openwebui;
  if (ow?.ingest_url && (!ow.events.length || ow.events.includes(event))) {
    try {
      const res = await fetch(ow.ingest_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary, metadata: payload }),
      });
      if (res.ok) sent = true;
    } catch {
      // ignore
    }
  }

  return sent;
}

export function formatChainVerifyReport(): string {
  const chain = verifyCompanyEventChain();
  const registry = loadCompanyEvents();
  const cross = validateCompanyEventChainWithRegistry(registry);
  const issues = [...chain.issues, ...cross.issues];
  const lines = [
    "# Company Events Chain Verify",
    "",
    `**Date:** ${currentDate()}`,
    `**Result:** ${chain.ok && cross.ok ? "OK" : "FAIL"}`,
    `**Links:** ${chain.checked}`,
    `**Registry events:** ${registry.events.length}`,
    "",
  ];
  if (issues.length) {
    lines.push("## Issues", "");
    for (const issue of issues) {
      lines.push(`- \`${issue.code}\` — ${issue.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
