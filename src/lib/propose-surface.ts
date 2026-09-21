/**
 * Propose-only surfaces for the twelve missing market features.
 * Path: src/lib/propose-surface.ts
 * No send, no transfer, no approval. ADR 0079.
 */
import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import type { InvoiceRegistrationCatalog } from "../../schemas/finance/invoice-registration-catalog.js";

export { buildAuditPackIndex, type AuditSampleRef } from "./audit-pack/index.js";
export {
  assertPurchaserIsNotAcceptor,
  assertSodAllowsApply,
  findSodConflicts,
  type SodDuty,
} from "./org/sod.js";

export type ProjectLine = {
  project_code?: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
};

/** Net credit minus debit, grouped by project_code. Lines without a code are skipped. */
export function summarizeProjectPl(
  entries: Array<{ lines: ProjectLine[] }>,
): Array<{ project_code: string; net_yen: number }> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.project_code) continue;
      const net = line.credit_yen - line.debit_yen;
      totals.set(line.project_code, (totals.get(line.project_code) ?? 0) + net);
    }
  }
  return [...totals.entries()]
    .map(([project_code, net_yen]) => ({ project_code, net_yen }))
    .sort((a, b) => a.project_code.localeCompare(b.project_code));
}

export type DueItem = { id: string; dueOn: string; kind: string };

export function scanFollowups(items: DueItem[], asOf: string, withinDays: number): DueItem[] {
  const start = Date.parse(`${asOf}T00:00:00Z`);
  const end = start + withinDays * 86_400_000;
  return items
    .filter((item) => {
      const due = Date.parse(`${item.dueOn}T00:00:00Z`);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export type StuckItem = { id: string; ownerId: string; waitingSince: string; kind: string };

export function scanBottlenecks(
  items: StuckItem[],
  asOf: string,
  stuckDays: number,
): Array<StuckItem & { stuckDays: number }> {
  const today = Date.parse(`${asOf}T00:00:00Z`);
  return items
    .map((item) => {
      const since = Date.parse(`${item.waitingSince}T00:00:00Z`);
      const days = Math.floor((today - since) / 86_400_000);
      return { ...item, stuckDays: days };
    })
    .filter((item) => item.stuckDays >= stuckDays)
    .sort((a, b) => b.stuckDays - a.stuckDays);
}

export type InvoiceCandidate = {
  tNumber?: string;
  taxCategory: "taxable_10" | "taxable_8" | "exempt" | "unknown";
  amountYen?: number;
  posting: "proposal";
};

/** Fixture parser. Does not call a live NTA API and does not post a journal. */
export function parseInvoiceFixture(text: string): InvoiceCandidate {
  const tNumber = text.match(/T\d{13}/)?.[0];
  let taxCategory: InvoiceCandidate["taxCategory"] = "unknown";
  if (/非課税|免税/.test(text)) taxCategory = "exempt";
  else if (/8%|８％|軽減/.test(text)) taxCategory = "taxable_8";
  else if (/10%|１０％|消費税/.test(text)) taxCategory = "taxable_10";
  const amount = text.match(/(\d{1,12})\s*円/);
  return {
    tNumber,
    taxCategory,
    amountYen: amount ? Number(amount[1]) : undefined,
    posting: "proposal",
  };
}

export function matchRegistration(
  catalog: InvoiceRegistrationCatalog,
  tNumber: string | undefined,
): "missing" | "verified" | "revoked" | "unknown" | "not_in_catalog" {
  if (!tNumber) return "missing";
  const row = catalog.registrations.find((item) => item.t_number === tNumber);
  if (!row) return "not_in_catalog";
  return row.status;
}

export type BantProposal = {
  budget?: string;
  authority?: string;
  need?: string;
  timing?: string;
  proposedStage: "qualify" | "propose" | "stay";
  apply: "human";
};

export function extractBant(transcript: string): BantProposal {
  const budget = transcript.match(/予算[:：]\s*([^\n]+)/)?.[1]?.trim();
  const authority = transcript.match(/決裁[:：]\s*([^\n]+)/)?.[1]?.trim();
  const need = transcript.match(/ニーズ[:：]\s*([^\n]+)/)?.[1]?.trim();
  const timing = transcript.match(/時期[:：]\s*([^\n]+)/)?.[1]?.trim();
  const filled = [budget, authority, need, timing].filter(Boolean).length;
  const proposedStage = filled >= 3 ? "propose" : filled >= 1 ? "qualify" : "stay";
  return { budget, authority, need, timing, proposedStage, apply: "human" };
}

export type DispatchStaff = { id: string; skills: string[]; free: boolean; waypoint?: string };
export type DispatchJob = { id: string; skill: string; waypoint?: string };

export function proposeDispatch(
  jobs: DispatchJob[],
  staff: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Array<{ jobId: string; staffId?: string; reason: string }> {
  return jobs.map((job) => {
    const candidates = staff.filter(
      (person) =>
        person.free &&
        person.skills.includes(job.skill) &&
        !excludeStaffIds.includes(person.id),
    );
    const samePoint = candidates.find((person) => job.waypoint && person.waypoint === job.waypoint);
    const chosen = samePoint ?? candidates[0];
    if (!chosen) return { jobId: job.id, reason: "no free staff with the skill" };
    return { jobId: job.id, staffId: chosen.id, reason: "proposal" };
  });
}

export type JobCompletionProposal = {
  report: string;
  stockProposal: { sku: string; qty: number } | null;
  customerNoticeDraft: string;
  sent: false;
};

export function proposeJobCompletion(text: string, jobId: string): JobCompletionProposal {
  const skuQty = text.match(/sku:(\S+)\s+qty:(\d+)/);
  const ja = text.match(/([A-Za-z0-9_-]+)を(\d+)個/);
  const stockProposal = skuQty
    ? { sku: skuQty[1], qty: Number(skuQty[2]) }
    : ja
      ? { sku: ja[1], qty: Number(ja[2]) }
      : null;
  return {
    report: text.trim(),
    stockProposal,
    customerNoticeDraft: `${jobId} の完了報告案。送信は人間の承認後。`,
    sent: false,
  };
}

export function proposeConsumption(
  sku: string,
  qty: number,
  onHand: number,
): { sku: string; nextQty: number; apply: "human" } {
  return { sku, nextQty: onHand - qty, apply: "human" };
}

export function proposeReorder(
  skus: Array<{ id: string; stock_qty: number; threshold: number }>,
): Array<{ sku: string; qty: number; apply: "human" }> {
  return skus
    .filter((sku) => sku.stock_qty <= sku.threshold)
    .map((sku) => ({ sku: sku.id, qty: sku.threshold - sku.stock_qty + 1, apply: "human" as const }));
}

export function analyzeFieldTime(
  rows: Array<{ staffId: string; minutes: number; travelMinutes: number }>,
): { totalMinutes: number; travelMinutes: number; suggestion: string } {
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const travelMinutes = rows.reduce((sum, row) => sum + row.travelMinutes, 0);
  const suggestion =
    travelMinutes > totalMinutes / 2
      ? "移動が作業時間の半分を超えています。近接するジョブを同じ担当案にまとめてください。"
      : "移動比率は半分以下です。割当案の見直しは必須ではありません。";
  return { totalMinutes, travelMinutes, suggestion };
}

export function issuePortalGrant(input: {
  granteeId: string;
  contractId?: string;
  invoiceId?: string;
  orderStatus?: string;
}): { path: string; shows: string[] } {
  const shows = [input.contractId, input.invoiceId, input.orderStatus].filter(
    (value): value is string => Boolean(value),
  );
  const digest = createHash("sha256").update(input.granteeId).digest("hex").slice(0, 12);
  return { path: `/portal/${digest}`, shows };
}

export function issueTrackingUrl(input: {
  jobId: string;
  assigneeId: string;
  eta: string;
}): { path: string; assigneeId: string; eta: string } {
  const digest = createHash("sha256").update(input.jobId).digest("hex").slice(0, 12);
  return { path: `/track/${digest}`, assigneeId: input.assigneeId, eta: input.eta };
}

const HR_FORBIDDEN_KEYS = ["my_number", "account_number", "bank_account_number"] as const;

export function assertNoHrSecretFields(raw: Record<string, unknown>): void {
  for (const key of HR_FORBIDDEN_KEYS) {
    if (key in raw) throw new Error(`refused L2 field ${key}`);
  }
}

export function startOnboarding(input: {
  personRef: string;
  esignCaseId?: string;
}): { personRef: string; steps: string[]; esignCaseId?: string } {
  assertNoHrSecretFields(input);
  return {
    personRef: input.personRef,
    esignCaseId: input.esignCaseId,
    steps: ["esign_request", "social_insurance_draft"],
  };
}

export type CashFlow = { date: string; yen: number };

export function buildDailyCashSeries(input: {
  openingYen: number;
  from: string;
  to: string;
  flows: CashFlow[];
}): Array<{ date: string; balanceYen: number }> {
  const series: Array<{ date: string; balanceYen: number }> = [];
  let balance = input.openingYen;
  const cursor = new Date(`${input.from}T00:00:00Z`);
  const end = new Date(`${input.to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    for (const flow of input.flows) {
      if (flow.date === date) balance += flow.yen;
    }
    series.push({ date, balanceYen: balance });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

export function renderQuotePdf(input: {
  quoteId: string;
  title: string;
  amountYen: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(input.title);
    doc.moveDown();
    doc.fontSize(12).text(`${input.quoteId}`);
    doc.text(`${input.amountYen} JPY`);
    doc.moveDown();
    doc.text("Draft. Sending requires human approval.");
    doc.end();
  });
}

export function bridgeEventIndex(
  refs: Array<{ kind: "contract" | "transfer" | "journal" | "hr_step"; id: string }>,
): Array<{ kind: string; id: string; digest: string }> {
  return refs.map((ref) => ({
    kind: ref.kind,
    id: ref.id,
    digest: createHash("sha256").update(`${ref.kind}:${ref.id}`).digest("hex"),
  }));
}

export function draftLostDealFollowup(input: { dealId: string; silentDays: number }): {
  dealId: string;
  draft: string;
  sent: false;
} {
  return {
    dealId: input.dealId,
    draft: `${input.dealId} は ${input.silentDays} 日動きがありません。フォロー文案です。送信は人間の承認後です。`,
    sent: false,
  };
}

/** Reference id only. Photo bytes are refused. Approval stays human. */
export function proposeExpenseIntake(input: {
  channel: "line" | "slack" | "mail" | "chat";
  referenceId: string;
  photo?: unknown;
}): { channel: string; referenceId: string; apply: "human" } {
  if (input.photo != null) throw new Error("photo bytes are refused");
  if (!/^[A-Za-z0-9-]{3,64}$/.test(input.referenceId)) {
    throw new Error("referenceId must be an id, not a document body");
  }
  return { channel: input.channel, referenceId: input.referenceId, apply: "human" };
}

/** Calculation already exists. This only names the broker transfer a human must run. */
export function proposePayrollTransfer(input: { payrollRunId: string; totalYen: number }): {
  payrollRunId: string;
  totalYen: number;
  instruction: "broker transfer";
  executed: false;
  taxPayment: "out_of_scope";
} {
  return {
    payrollRunId: input.payrollRunId,
    totalYen: input.totalYen,
    instruction: "broker transfer",
    executed: false,
    taxPayment: "out_of_scope",
  };
}

