/**
 * Issue a signed JP qualified (simplified) invoice receipt.
 * Path: src/lib/receipt-qr/issue.ts
 *
 * Issuer identity comes from the tenant; tax is rounded once per rate.
 * Persisted issues append to the registry, emit `steward.receipt.issued`
 * and keep the issuer payload (with claim_key) for PDF regeneration.
 */
import { createPrivateKey, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import {
  receiptDocumentTypeSchema,
  receiptLineSchema,
  receiptQrDataSchema,
  signedReceiptQrPayloadSchema,
  storedReceiptSchema,
  type ReceiptRegistry,
  type SignedReceiptQrPayload,
  type StoredReceipt,
} from "../../../schemas/receipt-qr.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { canonicalJson } from "../protocol/canonical.js";
import { ourOrgRef } from "../protocol/identity.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
  maybeSignEnvelope,
} from "../protocol/signing.js";
import { getClock } from "../runtime-context.js";
import {
  assertClaimEndpointUnderBase,
  loadReceiptConfigOrDefault,
  loadReceiptQrConfig,
} from "./config.js";
import { resolveReceiptIssuerIdentity } from "./issuer-identity.js";
import { receiptEventsDir } from "./paths.js";
import { saveIssuedReceiptPayload } from "./payload-store.js";
import { withRegistryLock } from "./registry.js";
import { sha256Hex, signReceiptDigest } from "./signature.js";

const CLAIM_KEY_BYTES = 24;
/** Preview sequence stays within 100–999 so ids keep the RCPT-YYYYMMDD-NNN shape. */
const PREVIEW_SEQUENCE_MIN = 100;
const PREVIEW_SEQUENCE_SPAN = 900;

const receiptIssueInputSchema = z.object({
  document_type: receiptDocumentTypeSchema,
  transaction_date: z.string().date(),
  /** Optional — always overwritten from tenant corporate identity. */
  issuer_name: z.string().min(1).optional(),
  /** Optional — always overwritten from tenant corporate identity. */
  invoice_registration_number: z.string().regex(/^T\d{13}$/).optional(),
  recipient_name: z.string().min(1).optional(),
  lines: z.array(receiptLineSchema).min(1),
  claim_endpoint: z.string().url(),
});

export type ReceiptIssueInput = z.input<typeof receiptIssueInputSchema>;

type ResolvedIssueInput = z.output<typeof receiptIssueInputSchema> & {
  issuer_name: string;
  invoice_registration_number: string;
};

type ReceiptQrConfig = ReturnType<typeof loadReceiptQrConfig>;

export type IssuedReceipt = {
  stored: StoredReceipt;
  qrPayload: SignedReceiptQrPayload;
  issuedEnvelope: EventEnvelope;
};

function withResolvedIssuer(input: ReceiptIssueInput): ResolvedIssueInput {
  const issuer = resolveReceiptIssuerIdentity();
  return receiptIssueInputSchema.parse({
    ...input,
    issuer_name: issuer.issuer_name,
    invoice_registration_number: issuer.invoice_registration_number,
  }) as ResolvedIssueInput;
}

function assertIssuePolicy(parsed: ResolvedIssueInput, config: ReceiptQrConfig): void {
  if (
    parsed.document_type === "qualified_simplified_invoice" &&
    !config.simple_invoice_eligible
  ) {
    throw new Error(
      "qualified_simplified_invoice is disabled: issuer eligibility is not configured",
    );
  }
  assertClaimEndpointUnderBase(parsed.claim_endpoint, config.claim_base_url);
  if (parsed.document_type === "qualified_invoice" && !parsed.recipient_name) {
    throw new Error("qualified_invoice requires recipient_name");
  }
}

/** Local-calendar `YYYYMMDD` used in `RCPT-YYYYMMDD-NNN`. */
function receiptIdDatePart(issuedAt: Date): string {
  return `${issuedAt.getFullYear()}${String(issuedAt.getMonth() + 1).padStart(2, "0")}${String(issuedAt.getDate()).padStart(2, "0")}`;
}

function nextReceiptId(registry: ReceiptRegistry, issuedAt: Date): string {
  const prefix = `RCPT-${receiptIdDatePart(issuedAt)}-`;
  const max = registry.receipts.reduce((current, row) => {
    if (!row.receipt.receipt_id.startsWith(prefix)) return current;
    return Math.max(
      current,
      Number(row.receipt.receipt_id.slice(prefix.length)) || 0,
    );
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** Ephemeral id for previews — random so it never implies a registry sequence. */
function previewReceiptId(issuedAt: Date): string {
  const seq = (randomBytes(2).readUInt16BE(0) % PREVIEW_SEQUENCE_SPAN) + PREVIEW_SEQUENCE_MIN;
  return `RCPT-${receiptIdDatePart(issuedAt)}-${String(seq).padStart(3, "0")}`;
}

function calculateTaxTotals(
  lines: z.output<typeof receiptLineSchema>[],
  rounding: "floor" | "round" | "ceil",
) {
  const byRate = new Map<
    number,
    { excluding: number; tax: number; including: number }
  >();
  for (const line of lines) {
    const current = byRate.get(line.tax_rate) ?? {
      excluding: 0,
      tax: 0,
      including: 0,
    };
    current.excluding += line.amount_excluding_tax;
    current.tax += line.tax_amount;
    current.including += line.amount_including_tax;
    byRate.set(line.tax_rate, current);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([tax_rate, value]) => {
      const calculatedTax = Math[rounding](value.excluding * (tax_rate / 100));
      if (
        value.tax !== calculatedTax ||
        value.including !== value.excluding + calculatedTax
      ) {
        throw new Error(
          `Tax total for ${tax_rate}% must be rounded once per rate using ${rounding}`,
        );
      }
      return {
        tax_rate: tax_rate as 0 | 8 | 10,
        amount_excluding_tax: value.excluding,
        tax_amount: calculatedTax,
        amount_including_tax: value.excluding + calculatedTax,
      };
    });
}

function createIssuedEnvelope(row: StoredReceipt): EventEnvelope {
  const origin = ourOrgRef();
  return maybeSignEnvelope({
    protocol_version: "1",
    event_id: row.issued_event_id,
    occurred_at: row.receipt.issued_at,
    origin,
    identity: { org_ref: origin },
    event: {
      type: "steward.receipt.issued",
      payload: {
        receipt_id: row.receipt.receipt_id,
        receipt_digest: row.digest,
        document_type: row.receipt.document_type,
      },
    },
    signature: null,
  });
}

function persistIssuedEnvelope(envelope: EventEnvelope): string {
  const dir = receiptEventsDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${envelope.event_id}.json`);
  writeFileSync(path, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
  return path;
}

function buildIssuedReceipt(
  parsed: ResolvedIssueInput,
  config: ReceiptQrConfig,
  signer: { issuedAt: Date; claimKey: string; privateKeyPem: string; publicKey: string },
  receiptId: string,
): IssuedReceipt {
  const taxTotals = calculateTaxTotals(parsed.lines, config.tax_rounding);
  const receipt = receiptQrDataSchema.parse({
    schema: "orgos.jp.receipt.v1",
    receipt_id: receiptId,
    document_type: parsed.document_type,
    issued_at: signer.issuedAt.toISOString(),
    transaction_date: parsed.transaction_date,
    currency: "JPY",
    issuer: {
      ...ourOrgRef(),
      name: parsed.issuer_name,
      invoice_registration_number: parsed.invoice_registration_number,
    },
    recipient_name: parsed.recipient_name,
    lines: parsed.lines,
    tax_totals: taxTotals,
    total_amount: taxTotals.reduce(
      (sum, total) => sum + total.amount_including_tax,
      0,
    ),
    claim: {
      endpoint: parsed.claim_endpoint,
      claim_key: signer.claimKey,
    },
  });
  const digest = sha256Hex(canonicalJson(receipt));
  const signature = signReceiptDigest(digest, createPrivateKey(signer.privateKeyPem));
  const qrPayload = signedReceiptQrPayloadSchema.parse({
    receipt,
    digest,
    signature,
    issuer_public_key: signer.publicKey,
  });
  const { claim: _claim, ...storedReceipt } = receipt;
  const stored = storedReceiptSchema.parse({
    receipt: storedReceipt,
    digest,
    signature,
    issuer_public_key: signer.publicKey,
    claim_endpoint: parsed.claim_endpoint,
    claim_key_hash: sha256Hex(signer.claimKey),
    claim_status: "unclaimed",
    issued_event_id: randomUUID(),
  });
  return { stored, qrPayload, issuedEnvelope: createIssuedEnvelope(stored) };
}

/**
 * `persist: false` is a preview: config defaults apply and nothing is written.
 * A persisted issue requires `data/receipt-qr/config.yaml` (`orgos receipt init`).
 */
export function issueReceipt(
  input: ReceiptIssueInput,
  options: { persist?: boolean } = {},
): IssuedReceipt {
  const persist = options.persist !== false;
  const parsed = withResolvedIssuer(input);
  const config = persist ? loadReceiptQrConfig() : loadReceiptConfigOrDefault();
  assertIssuePolicy(parsed, config);

  const issuedAt = getClock().now();
  const claimKey = randomBytes(CLAIM_KEY_BYTES).toString("base64url");
  const privateKeyPem = ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) throw new Error("Protocol public key unavailable");
  const signer = { issuedAt, claimKey, privateKeyPem, publicKey };

  if (!persist) {
    return buildIssuedReceipt(parsed, config, signer, previewReceiptId(issuedAt));
  }

  return withRegistryLock((registry) => {
    const result = buildIssuedReceipt(
      parsed,
      config,
      signer,
      nextReceiptId(registry, issuedAt),
    );
    registry.receipts.push(result.stored);
    persistIssuedEnvelope(result.issuedEnvelope);
    saveIssuedReceiptPayload(result.qrPayload);
    return result;
  });
}

export function parseReceiptIssueInputFile(path: string): ReceiptIssueInput {
  const raw = readFileSync(path, "utf-8");
  const parsed = path.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  return receiptIssueInputSchema.parse(parsed);
}
