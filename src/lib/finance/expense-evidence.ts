import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  expenseEvidenceManifestEntrySchema,
  expenseEvidenceManifestSchema,
  type ExpenseEvidenceManifest,
  type ExpenseEvidenceManifestEntry,
} from "../../../schemas/finance/expense-evidence.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { getClock } from "../runtime-context.js";

const ARCHIVE_REL = "finance/expense-evidence";
const MANIFEST_REL = "finance/expense-evidence-manifest.yaml";

function manifestPath(): string {
  return join(getDataDir(), MANIFEST_REL);
}

export function loadExpenseEvidenceManifest(): ExpenseEvidenceManifest {
  return existsSync(manifestPath())
    ? readYamlFile(manifestPath(), expenseEvidenceManifestSchema)
    : expenseEvidenceManifestSchema.parse({ version: 1, evidence: [] });
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function retentionDate(transactionDate: string): string {
  const [year, month, day] = transactionDate.split("-").map(Number);
  const date = new Date(Date.UTC(year! + 7, month! - 1, day!));
  return date.toISOString().slice(0, 10);
}

function redactedCanonicalPayload(payload: SignedReceiptQrPayload): string {
  const copy = structuredClone(payload);
  if (copy.receipt.claim) {
    delete (copy.receipt.claim as { claim_key?: string }).claim_key;
  }
  return `${JSON.stringify(copy, null, 2)}\n`;
}

export function archiveExpenseEvidence(input: {
  claimId: string;
  payload: SignedReceiptQrPayload;
}): ExpenseEvidenceManifestEntry {
  const receipt = input.payload.receipt;
  const tNumber = receipt.issuer.invoice_registration_number;
  if (!tNumber) throw new Error("Cannot archive evidence without T number");
  const evidenceId = `EE-${input.claimId}`;
  const archiveRel = `${ARCHIVE_REL}/${input.claimId}.json`;
  const archivePath = join(getDataDir(), archiveRel);
  const content = redactedCanonicalPayload(input.payload);
  const digest = sha256(content);
  mkdirSync(join(getDataDir(), ARCHIVE_REL), { recursive: true });
  if (existsSync(archivePath)) {
    const current = readFileSync(archivePath);
    if (sha256(current) !== digest) {
      throw new Error(`Immutable expense evidence differs: ${archiveRel}`);
    }
  } else {
    writeFileSync(archivePath, content, { encoding: "utf8", flag: "wx" });
  }

  const manifest = loadExpenseEvidenceManifest();
  const existing = manifest.evidence.find(
    (entry) => entry.evidence_id === evidenceId,
  );
  if (existing) {
    if (existing.sha256 !== digest || existing.archive_path !== archiveRel) {
      throw new Error(`Expense evidence manifest collision: ${evidenceId}`);
    }
    return existing;
  }
  const entry = expenseEvidenceManifestEntrySchema.parse({
    evidence_id: evidenceId,
    claim_id: input.claimId,
    receipt_id: receipt.receipt_id,
    t_number: tNumber,
    transaction_date: receipt.transaction_date,
    archive_path: archiveRel,
    sha256: digest,
    archived_at: getClock().nowIso(),
    retention_until: retentionDate(receipt.transaction_date),
  });
  manifest.evidence.push(entry);
  writeYamlFile(manifestPath(), expenseEvidenceManifestSchema.parse(manifest));
  return entry;
}

export type ExpenseEvidenceVerification = {
  evidence_id: string;
  ok: boolean;
  error?: string;
};

export function verifyExpenseEvidence(
  claimId?: string,
): ExpenseEvidenceVerification[] {
  return loadExpenseEvidenceManifest()
    .evidence.filter((entry) => !claimId || entry.claim_id === claimId)
    .map((entry) => {
      const path = join(getDataDir(), entry.archive_path);
      if (!existsSync(path)) {
        return {
          evidence_id: entry.evidence_id,
          ok: false,
          error: `archive missing: ${entry.archive_path}`,
        };
      }
      const actual = sha256(readFileSync(path));
      return actual === entry.sha256
        ? { evidence_id: entry.evidence_id, ok: true }
        : {
            evidence_id: entry.evidence_id,
            ok: false,
            error: `digest mismatch: expected ${entry.sha256}, got ${actual}`,
          };
    });
}

export function searchExpenseEvidence(input: {
  claimId?: string;
  receiptId?: string;
  tNumber?: string;
  transactionDate?: string;
}): ExpenseEvidenceManifestEntry[] {
  return loadExpenseEvidenceManifest().evidence.filter(
    (entry) =>
      (!input.claimId || entry.claim_id === input.claimId) &&
      (!input.receiptId || entry.receipt_id === input.receiptId) &&
      (!input.tNumber || entry.t_number === input.tNumber) &&
      (!input.transactionDate ||
        entry.transaction_date === input.transactionDate),
  );
}
