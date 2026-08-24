import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { z } from "zod";
import YAML from "yaml";
import {
  receiptDocumentTypeSchema,
  receiptLineSchema,
  receiptQrDataSchema,
  receiptRegistrySchema,
  receiptQrConfigSchema,
  signedReceiptQrPayloadSchema,
  storedReceiptSchema,
  type ReceiptQrData,
  type ReceiptRegistry,
  type SignedReceiptQrPayload,
  type StoredReceipt,
} from "../../schemas/receipt-qr.js";
import { canonicalJson } from "./protocol/canonical.js";
import { ourOrgRef } from "./protocol/identity.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
  maybeSignEnvelope,
} from "./protocol/signing.js";
import type { EventEnvelope } from "../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../schemas/protocol/org-event.js";
import { getTenantDir, loadTenantConfig } from "./tenant.js";
import { currentDate, getDataDir, readYamlFile } from "./utils.js";
import { getClock } from "./runtime-context.js";
import { loadCompany, loadTaxProfile } from "./data.js";
import { findPeer } from "./protocol/peers.js";
import {
  findPeerByOrgRef,
  verifyInboundProtocolEnvelope,
} from "./protocol/inbound-verify.js";
import {
  approveInterOrgNotice,
  bridgeProposeReceiptClaimed,
  rejectInterOrgNotice,
} from "./wire/notice-workflow.js";

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

export type ReceiptIssuerIdentity = {
  issuer_name: string;
  invoice_registration_number: string;
  corporate_number: string;
  source: {
    name: "company.yaml" | "tenant.yaml";
    invoice_registration: "tax-profile" | "corporate_number";
  };
};

/**
 * Resolve issuer display name + T番号 from the active tenant.
 * JP: 適格請求書発行事業者登録番号 = `T` + 法人番号（13桁）.
 * Operator Console session is already scoped to one tenant (Google ID → operator
 * → ORGOS_TENANT); callers must not accept free-form issuer fields from the UI.
 */
export function resolveReceiptIssuerIdentity(): ReceiptIssuerIdentity {
  const company = loadCompany();
  const tenant = loadTenantConfig();
  const issuerName =
    company.name?.trim() ||
    tenant.legal_name?.trim() ||
    tenant.display_name?.trim() ||
    "";
  if (!issuerName) {
    throw new Error(
      "Company name missing: set name in data/company.yaml (or legal_name in tenant.yaml)",
    );
  }

  const corporateNumber = company.corporate_number?.trim() ?? "";
  if (!/^\d{13}$/.test(corporateNumber)) {
    throw new Error(
      "corporate_number (13 digits) required in data/company.yaml to issue receipts",
    );
  }

  let invoiceRegistration = `T${corporateNumber}`;
  let invoiceSource: ReceiptIssuerIdentity["source"]["invoice_registration"] =
    "corporate_number";
  try {
    const tax = loadTaxProfile() as {
      consumption_tax?: { invoice_registration_number?: string };
    };
    const fromTax = tax.consumption_tax?.invoice_registration_number?.trim();
    if (fromTax) {
      if (!/^T\d{13}$/.test(fromTax)) {
        throw new Error(
          `Invalid consumption_tax.invoice_registration_number in tax-profile: ${fromTax}`,
        );
      }
      if (fromTax !== `T${corporateNumber}`) {
        throw new Error(
          `invoice_registration_number ${fromTax} must equal T + corporate_number ${corporateNumber}`,
        );
      }
      invoiceRegistration = fromTax;
      invoiceSource = "tax-profile";
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Invalid consumption_tax") ||
        error.message.startsWith("invoice_registration_number"))
    ) {
      throw error;
    }
    // Missing or non-JP tax-profile: fall back to T + corporate_number.
  }

  return {
    issuer_name: issuerName,
    invoice_registration_number: invoiceRegistration,
    corporate_number: corporateNumber,
    source: {
      name: company.name?.trim() ? "company.yaml" : "tenant.yaml",
      invoice_registration: invoiceSource,
    },
  };
}

function withResolvedIssuer(
  input: ReceiptIssueInput,
): z.output<typeof receiptIssueInputSchema> & {
  issuer_name: string;
  invoice_registration_number: string;
} {
  const issuer = resolveReceiptIssuerIdentity();
  return receiptIssueInputSchema.parse({
    ...input,
    issuer_name: issuer.issuer_name,
    invoice_registration_number: issuer.invoice_registration_number,
  }) as z.output<typeof receiptIssueInputSchema> & {
    issuer_name: string;
    invoice_registration_number: string;
  };
}

const RECEIPT_LINK_VERSION = "v2z";
const LEGACY_RECEIPT_LINK_VERSION = "v1";
const MAX_RECEIPT_LINK_COMPRESSED_BYTES = 16 * 1024;
const MAX_RECEIPT_LINK_BYTES = 64 * 1024;

const compactReceiptPayloadSchema = z.object({
  i: z.string(),
  y: z.union([z.literal(0), z.literal(1)]),
  a: z.string(),
  d: z.string(),
  u: z.tuple([z.string(), z.string(), z.string()]),
  n: z.string().optional(),
  l: z.array(
    z.tuple([
      z.string(),
      z.number().nullable(),
      z.union([z.literal(0), z.literal(8), z.literal(10)]),
      z.union([z.literal(0), z.literal(1)]),
      z.number(),
      z.number(),
      z.number(),
    ]),
  ),
  x: z.array(
    z.tuple([
      z.union([z.literal(0), z.literal(8), z.literal(10)]),
      z.number(),
      z.number(),
      z.number(),
    ]),
  ),
  m: z.number(),
  e: z.string().optional(),
  c: z.string().optional(),
  f: z.string().optional(),
  g: z.string(),
  p: z.string(),
});

type CompactReceiptPayload = z.output<typeof compactReceiptPayloadSchema>;

function compactReceiptPayload(
  payload: SignedReceiptQrPayload,
): CompactReceiptPayload {
  const receipt = payload.receipt;
  return compactReceiptPayloadSchema.parse({
    i: receipt.receipt_id,
    y: receipt.document_type === "qualified_invoice" ? 0 : 1,
    a: receipt.issued_at,
    d: receipt.transaction_date,
    u: [
      receipt.issuer.org_id,
      receipt.issuer.name,
      receipt.issuer.invoice_registration_number,
    ],
    n: receipt.recipient_name,
    l: receipt.lines.map((line) => [
      line.description,
      line.quantity ?? null,
      line.tax_rate,
      line.reduced_tax ? 1 : 0,
      line.amount_excluding_tax,
      line.tax_amount,
      line.amount_including_tax,
    ]),
    x: receipt.tax_totals.map((total) => [
      total.tax_rate,
      total.amount_excluding_tax,
      total.tax_amount,
      total.amount_including_tax,
    ]),
    m: receipt.total_amount,
    e: receipt.claim?.endpoint,
    c: receipt.claim?.claim_key,
    f: receipt.fetch_url,
    g: payload.signature,
    p: payload.issuer_public_key,
  });
}

function expandReceiptPayload(raw: unknown): SignedReceiptQrPayload {
  const compact = compactReceiptPayloadSchema.parse(raw);
  const receipt = receiptQrDataSchema.parse({
    schema: "orgos.jp.receipt.v1",
    receipt_id: compact.i,
    document_type:
      compact.y === 0 ? "qualified_invoice" : "qualified_simplified_invoice",
    issued_at: compact.a,
    transaction_date: compact.d,
    currency: "JPY",
    issuer: {
      org_id: compact.u[0],
      name: compact.u[1],
      invoice_registration_number: compact.u[2],
    },
    recipient_name: compact.n,
    lines: compact.l.map((line) => ({
      description: line[0],
      quantity: line[1] ?? undefined,
      tax_rate: line[2],
      reduced_tax: line[3] === 1,
      amount_excluding_tax: line[4],
      tax_amount: line[5],
      amount_including_tax: line[6],
    })),
    tax_totals: compact.x.map((total) => ({
      tax_rate: total[0],
      amount_excluding_tax: total[1],
      tax_amount: total[2],
      amount_including_tax: total[3],
    })),
    total_amount: compact.m,
    claim:
      compact.e && compact.c
        ? { endpoint: compact.e, claim_key: compact.c }
        : undefined,
    fetch_url: compact.f,
  });
  return signedReceiptQrPayloadSchema.parse({
    receipt,
    digest: sha256(canonicalJson(receipt)),
    signature: compact.g,
    issuer_public_key: compact.p,
  });
}

export function encodeReceiptLink(
  payload: SignedReceiptQrPayload,
  portalUrl = "https://receipt.oorgos.org/r",
): string {
  const parsed = signedReceiptQrPayloadSchema.parse(payload);
  const compressed = deflateSync(
    Buffer.from(JSON.stringify(compactReceiptPayload(parsed)), "utf-8"),
    { level: 9 },
  );
  const encoded = compressed.toString("base64url");
  return `${portalUrl.replace(/#.*$/, "")}#${RECEIPT_LINK_VERSION}.${encoded}`;
}

export function decodeReceiptLink(value: string): SignedReceiptQrPayload {
  const fragment = value.includes("#")
    ? value.slice(value.indexOf("#") + 1)
    : value;
  const currentPrefix = `${RECEIPT_LINK_VERSION}.`;
  if (fragment.startsWith(currentPrefix)) {
    const compressed = Buffer.from(
      fragment.slice(currentPrefix.length),
      "base64url",
    );
    if (compressed.byteLength > MAX_RECEIPT_LINK_COMPRESSED_BYTES)
      throw new Error("Receipt link payload is too large");
    const raw = inflateSync(compressed, {
      maxOutputLength: MAX_RECEIPT_LINK_BYTES,
    }).toString("utf-8");
    return expandReceiptPayload(JSON.parse(raw));
  }
  const legacyPrefix = `${LEGACY_RECEIPT_LINK_VERSION}.`;
  if (fragment.startsWith(legacyPrefix)) {
    const raw = Buffer.from(
      fragment.slice(legacyPrefix.length),
      "base64url",
    ).toString("utf-8");
    return signedReceiptQrPayloadSchema.parse(JSON.parse(raw));
  }
  if (fragment.startsWith("{")) {
    return signedReceiptQrPayloadSchema.parse(JSON.parse(fragment));
  }
  throw new Error("Unsupported receipt link version");
}

export function receiptDigest(receipt: ReceiptQrData): string {
  return sha256(canonicalJson(receiptQrDataSchema.parse(receipt)));
}

export function receiptSnapshotDir(): string {
  return join(getDataDir(), "receipt-qr", "snapshots");
}

export function saveVerifiedReceiptSnapshot(
  payload: SignedReceiptQrPayload,
): string {
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Receipt verification failed: ${verified.reason}`);
  }
  const dir = receiptSnapshotDir();
  mkdirSync(dir, { recursive: true });
  const relative = `receipt-qr/snapshots/${verified.payload.receipt.receipt_id}.json`;
  const absolute = join(getDataDir(), relative);
  writeFileSync(
    absolute,
    `${JSON.stringify(verified.payload, null, 2)}\n`,
    "utf-8",
  );
  return relative;
}

export async function fetchSignedReceiptOnline(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<SignedReceiptQrPayload> {
  const endpoint = new URL(url);
  const localDemo =
    endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (endpoint.protocol !== "https:" && !localDemo) {
    throw new Error(
      "Receipt fetch requires HTTPS (HTTP allowed only for localhost demo)",
    );
  }
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Receipt fetch failed: HTTP ${response.status}`);
  }
  const raw = await response.json();
  const verified = verifySignedReceiptPayload(raw);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Fetched receipt invalid: ${verified.reason}`);
  }
  return verified.payload;
}

/**
 * Ingest from QR link / JSON paste. Prefers embedded signed payload;
 * if fetch_url is present, re-fetches online source of truth.
 */
export async function ingestReceiptQrPayload(
  input: string,
  fetchFn: typeof fetch = fetch,
): Promise<{
  payload: SignedReceiptQrPayload;
  snapshot_path: string;
}> {
  let payload: SignedReceiptQrPayload | undefined;
  const trimmed = input.trim();
  try {
    payload = decodeReceiptLink(trimmed);
  } catch {
    payload = undefined;
  }
  if (!payload && trimmed.startsWith("{")) {
    const raw = JSON.parse(trimmed) as unknown;
    const verified = verifySignedReceiptPayload(raw);
    if (verified.ok && verified.payload) payload = verified.payload;
  }
  if (!payload) {
    throw new Error(
      "Signed receipt payload required (QR link or JSON). Unsigned manual draft is disabled by default.",
    );
  }
  if (payload.receipt.fetch_url) {
    payload = await fetchSignedReceiptOnline(payload.receipt.fetch_url, fetchFn);
  }
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Receipt verification failed: ${verified.reason}`);
  }
  const snapshot_path = saveVerifiedReceiptSnapshot(verified.payload);
  return { payload: verified.payload, snapshot_path };
}

/** Test helper: sign a receipt with an ephemeral Ed25519 key. */
export function signReceiptForTests(
  receipt: ReceiptQrData,
): SignedReceiptQrPayload {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const parsed = receiptQrDataSchema.parse(receipt);
  const digest = receiptDigest(parsed);
  const signature = sign(null, Buffer.from(digest, "hex"), privateKey);
  return signedReceiptQrPayloadSchema.parse({
    receipt: parsed,
    digest,
    signature: signature.toString("base64"),
    issuer_public_key: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  });
}

export function loadReceiptSnapshot(
  relativePath: string,
): SignedReceiptQrPayload | undefined {
  const absolute = join(getDataDir(), relativePath);
  if (!existsSync(absolute)) return undefined;
  const raw = JSON.parse(readFileSync(absolute, "utf-8")) as unknown;
  const verified = verifySignedReceiptPayload(raw);
  return verified.ok ? verified.payload : undefined;
}

/** Re-sign with a known private key (base64 PKCS8) for fixtures. */
export function signReceiptWithKey(
  receipt: ReceiptQrData,
  privateKeyPkcs8Base64: string,
  publicKeySpkiBase64: string,
): SignedReceiptQrPayload {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8Base64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const parsed = receiptQrDataSchema.parse(receipt);
  const digest = receiptDigest(parsed);
  const signature = sign(null, Buffer.from(digest, "hex"), privateKey);
  return signedReceiptQrPayloadSchema.parse({
    receipt: parsed,
    digest,
    signature: signature.toString("base64"),
    issuer_public_key: publicKeySpkiBase64,
  });
}

function receiptDataDir(): string {
  return join(getTenantDir(), "data", "receipt-qr");
}

export function receiptRegistryPath(): string {
  return join(receiptDataDir(), "receipts.yaml");
}

function receiptConfigPath(): string {
  return join(receiptDataDir(), "config.yaml");
}

/** Default used when config.yaml is missing (preview / first-run UX). */
export function defaultReceiptQrConfig() {
  return receiptQrConfigSchema.parse({
    schema: "orgos.jp.receipt.config.v1",
    claim_base_url: "http://127.0.0.1:8787/wire/v1/receipts/claim",
    receipt_portal_url: "https://receipt.oorgos.org/r",
    simple_invoice_eligible: true,
    simple_invoice_basis: "default until orgos receipt init",
    tax_rounding: "floor",
  });
}

function loadReceiptConfig() {
  const path = receiptConfigPath();
  if (!existsSync(path))
    throw new Error(`Receipt QR config not found: ${path}`);
  return readYamlFile(path, receiptQrConfigSchema);
}

/** Prefer tenant config; fall back to defaults (does not write disk). */
export function loadReceiptConfigOrDefault() {
  const path = receiptConfigPath();
  if (!existsSync(path)) return defaultReceiptQrConfig();
  return loadReceiptConfig();
}

export function receiptPortalUrl(): string {
  return loadReceiptConfigOrDefault().receipt_portal_url;
}

function receiptEventsDir(): string {
  return join(receiptDataDir(), "events");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function loadReceiptRegistry(): ReceiptRegistry {
  const path = receiptRegistryPath();
  if (!existsSync(path)) return { receipts: [] };
  return readYamlFile(path, receiptRegistrySchema);
}

function writeReceiptRegistryAtomic(registry: ReceiptRegistry): void {
  const path = receiptRegistryPath();
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const serialized =
    JSON.stringify({ ...registry, as_of: currentDate() }, null, 2) + "\n";
  writeFileSync(temp, serialized, { encoding: "utf-8", mode: 0o600 });
  renameSync(temp, path);
}

function withRegistryLock<T>(fn: (registry: ReceiptRegistry) => T): T {
  const path = receiptRegistryPath();
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let fd: number;
  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error("Receipt registry is busy; retry the operation");
  }
  try {
    const registry = loadReceiptRegistry();
    const result = fn(registry);
    writeReceiptRegistryAtomic(receiptRegistrySchema.parse(registry));
    return result;
  } finally {
    closeSync(fd);
    unlinkSync(lockPath);
  }
}

function nextReceiptId(registry: ReceiptRegistry, issuedAt: Date): string {
  const ymd = `${issuedAt.getFullYear()}${String(issuedAt.getMonth() + 1).padStart(2, "0")}${String(issuedAt.getDate()).padStart(2, "0")}`;
  const prefix = `RCPT-${ymd}-`;
  const max = registry.receipts.reduce((current, row) => {
    if (!row.receipt.receipt_id.startsWith(prefix)) return current;
    return Math.max(
      current,
      Number(row.receipt.receipt_id.slice(prefix.length)) || 0,
    );
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
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

export function issueReceipt(
  input: ReceiptIssueInput,
  options: { persist?: boolean } = {},
): {
  stored: StoredReceipt;
  qrPayload: SignedReceiptQrPayload;
  issuedEnvelope: EventEnvelope;
} {
  const persist = options.persist !== false;
  const parsed = withResolvedIssuer(input);
  const config = persist ? loadReceiptConfig() : loadReceiptConfigOrDefault();
  // Preview may run before `orgos receipt init`; real issue still requires config
  // unless caller supplied claim_endpoint under defaults (auto-heal below).
  if (persist && !existsSync(receiptConfigPath())) {
    throw new Error(
      `Receipt QR config not found: ${receiptConfigPath()} — run: orgos receipt init --claim-base-url <url>`,
    );
  }
  if (
    parsed.document_type === "qualified_simplified_invoice" &&
    !config.simple_invoice_eligible
  ) {
    throw new Error(
      "qualified_simplified_invoice is disabled: issuer eligibility is not configured",
    );
  }
  if (
    !parsed.claim_endpoint.startsWith(config.claim_base_url.replace(/\/$/, ""))
  ) {
    throw new Error(
      "claim_endpoint must be under the configured claim_base_url",
    );
  }
  if (parsed.document_type === "qualified_invoice" && !parsed.recipient_name) {
    throw new Error("qualified_invoice requires recipient_name");
  }

  const issuedAt = getClock().now();
  const claimKey = randomBytes(24).toString("base64url");
  const privateKeyPem = ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) throw new Error("Protocol public key unavailable");

  const build = (receiptId: string) => {
    const taxTotals = calculateTaxTotals(parsed.lines, config.tax_rounding);
    const receipt = receiptQrDataSchema.parse({
      schema: "orgos.jp.receipt.v1",
      receipt_id: receiptId,
      document_type: parsed.document_type,
      issued_at: issuedAt.toISOString(),
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
        claim_key: claimKey,
      },
    });
    const digest = sha256(canonicalJson(receipt));
    const signature = sign(
      null,
      Buffer.from(digest, "hex"),
      createPrivateKey(privateKeyPem),
    ).toString("base64");
    const qrPayload = signedReceiptQrPayloadSchema.parse({
      receipt,
      digest,
      signature,
      issuer_public_key: publicKey,
    });
    const { claim: _claim, ...storedReceipt } = receipt;
    const stored = storedReceiptSchema.parse({
      receipt: storedReceipt,
      digest,
      signature,
      issuer_public_key: publicKey,
      claim_endpoint: parsed.claim_endpoint,
      claim_key_hash: sha256(claimKey),
      claim_status: "unclaimed",
      issued_event_id: randomUUID(),
    });
    const issuedEnvelope = createIssuedEnvelope(stored);
    return { stored, qrPayload, issuedEnvelope };
  };

  if (!persist) {
    // Ephemeral issue for browser/demo seeds — do not grow receipts.yaml.
    // Keep receipt_id shape RCPT-YYYYMMDD-NNN required by schema.
    const ymd = `${issuedAt.getFullYear()}${String(issuedAt.getMonth() + 1).padStart(2, "0")}${String(issuedAt.getDate()).padStart(2, "0")}`;
    const seq = String((randomBytes(2).readUInt16BE(0) % 900) + 100).padStart(
      3,
      "0",
    );
    return build(`RCPT-${ymd}-${seq}`);
  }

  return withRegistryLock((registry) => {
    const result = build(nextReceiptId(registry, issuedAt));
    registry.receipts.push(result.stored);
    persistIssuedEnvelope(result.issuedEnvelope);
    saveIssuedReceiptPayload(result.qrPayload);
    return result;
  });
}

export function verifySignedReceiptPayload(raw: unknown): {
  ok: boolean;
  payload?: SignedReceiptQrPayload;
  reason?: string;
} {
  const parsed = signedReceiptQrPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "schema_invalid" };
  const expectedDigest = sha256(canonicalJson(parsed.data.receipt));
  if (expectedDigest !== parsed.data.digest)
    return { ok: false, reason: "digest_mismatch" };
  const publicKey = createPublicKey({
    key: Buffer.from(parsed.data.issuer_public_key, "base64"),
    format: "der",
    type: "spki",
  });
  const valid = verify(
    null,
    Buffer.from(parsed.data.digest, "hex"),
    publicKey,
    Buffer.from(parsed.data.signature, "base64"),
  );
  return valid
    ? { ok: true, payload: parsed.data }
    : { ok: false, reason: "signature_invalid" };
}

function keyMatches(expectedHash: string, candidate: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(sha256(candidate), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function claimReceipt(options: {
  receiptId: string;
  claimKey: string;
  claimantPeerId: string;
  claimantOrgId: string;
  proposedBy: string;
  requestEventId?: string;
  receiptDigest?: string;
}): { receipt: StoredReceipt; approvalId: string; idempotent: boolean } {
  const peer = findPeer(options.claimantPeerId);
  if (!peer) throw new Error(`Peer ${options.claimantPeerId} not registered`);
  return withRegistryLock((registry) => {
    const index = registry.receipts.findIndex(
      (row) => row.receipt.receipt_id === options.receiptId,
    );
    if (index < 0) throw new Error(`Receipt not found: ${options.receiptId}`);
    const row = registry.receipts[index]!;
    if (options.receiptDigest && options.receiptDigest !== row.digest) {
      throw new Error("Receipt digest mismatch");
    }
    if (!keyMatches(row.claim_key_hash, options.claimKey)) {
      throw new Error("Invalid receipt claim key");
    }
    if (row.claim_status !== "unclaimed") {
      if (
        row.claimed_by_org_id === options.claimantOrgId &&
        row.claim_approval_id
      ) {
        return {
          receipt: row,
          approvalId: row.claim_approval_id,
          idempotent: true,
        };
      }
      throw new Error(
        "Receipt claim key has already been consumed by another OOO",
      );
    }
    const requestEventId = options.requestEventId ?? randomUUID();
    const approval = bridgeProposeReceiptClaimed({
      peerId: options.claimantPeerId,
      receiptId: options.receiptId,
      receiptDigest: row.digest,
      proposedBy: options.proposedBy,
      correlationEventId: requestEventId,
      message: `領収書 ${options.receiptId} claim · digest ${row.digest}`,
    });
    const updated = storedReceiptSchema.parse({
      ...row,
      claim_status: "claim_pending_approval",
      claimed_by_org_id: options.claimantOrgId,
      claimed_by_peer_id: options.claimantPeerId,
      claim_requested_at: new Date().toISOString(),
      claim_approval_id: approval.notice_id,
    });
    registry.receipts[index] = updated;
    return {
      receipt: updated,
      approvalId: approval.notice_id,
      idempotent: false,
    };
  });
}

export function approveReceiptClaim(options: {
  receiptId: string;
  approverId: string;
  operatorId?: string;
}): StoredReceipt {
  const row = loadReceiptRegistry().receipts.find(
    (candidate) => candidate.receipt.receipt_id === options.receiptId,
  );
  if (!row?.claim_approval_id)
    throw new Error("Receipt has no pending claim approval");
  if (row.claim_status !== "claim_pending_approval") {
    throw new Error(
      `Receipt claim is not pending approval (status=${row.claim_status})`,
    );
  }
  const approved = approveInterOrgNotice({
    noticeId: row.claim_approval_id,
    approverId: options.approverId,
    operatorId: options.operatorId,
  });
  return withRegistryLock((registry) => {
    const index = registry.receipts.findIndex(
      (candidate) => candidate.receipt.receipt_id === options.receiptId,
    );
    if (index < 0) throw new Error(`Receipt not found: ${options.receiptId}`);
    const updated = storedReceiptSchema.parse({
      ...registry.receipts[index],
      claim_status: "claimed",
      claimed_event_id: approved.transmission.envelope.event_id,
      claimed_at: new Date().toISOString(),
    });
    registry.receipts[index] = updated;
    return updated;
  });
}

export function rejectReceiptClaim(options: {
  receiptId: string;
  approverId: string;
  reason: string;
}): StoredReceipt {
  const reason = options.reason.trim();
  if (!reason) throw new Error("Reject reason is required");
  const row = loadReceiptRegistry().receipts.find(
    (candidate) => candidate.receipt.receipt_id === options.receiptId,
  );
  if (!row?.claim_approval_id)
    throw new Error("Receipt has no pending claim approval");
  if (row.claim_status !== "claim_pending_approval") {
    throw new Error(
      `Receipt claim is not pending approval (status=${row.claim_status})`,
    );
  }
  rejectInterOrgNotice({
    noticeId: row.claim_approval_id,
    approverId: options.approverId,
    reason,
  });
  return withRegistryLock((registry) => {
    const index = registry.receipts.findIndex(
      (candidate) => candidate.receipt.receipt_id === options.receiptId,
    );
    if (index < 0) throw new Error(`Receipt not found: ${options.receiptId}`);
    const updated = storedReceiptSchema.parse({
      ...registry.receipts[index],
      claim_status: "claim_rejected",
      claim_rejected_at: new Date().toISOString(),
      claim_reject_reason: reason,
      claim_rejected_by: options.approverId,
    });
    registry.receipts[index] = updated;
    return updated;
  });
}

export type ReceiptQrConfigInitInput = {
  claim_base_url: string;
  receipt_portal_url?: string;
  simple_invoice_eligible?: boolean;
  simple_invoice_basis?: string;
  tax_rounding?: "floor" | "round" | "ceil";
};

/** Create `data/receipt-qr/config.yaml` if missing (or overwrite when forced). */
export function initReceiptQrConfig(
  input: ReceiptQrConfigInitInput,
  options: { force?: boolean } = {},
): string {
  const path = receiptConfigPath();
  if (existsSync(path) && !options.force) {
    throw new Error(`Receipt QR config already exists: ${path}`);
  }
  const config = receiptQrConfigSchema.parse({
    schema: "orgos.jp.receipt.config.v1",
    claim_base_url: input.claim_base_url.replace(/\/$/, ""),
    receipt_portal_url:
      input.receipt_portal_url ?? "https://receipt.oorgos.org/r",
    simple_invoice_eligible: input.simple_invoice_eligible ?? false,
    simple_invoice_basis: input.simple_invoice_basis,
    tax_rounding: input.tax_rounding ?? "floor",
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), { encoding: "utf-8", mode: 0o600 });
  return path;
}

export function loadReceiptQrConfig() {
  return loadReceiptConfig();
}

function receiptIssuedDir(): string {
  return join(receiptDataDir(), "issued");
}

export function saveIssuedReceiptPayload(
  payload: SignedReceiptQrPayload,
): string {
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(`Issued receipt invalid: ${verified.reason}`);
  }
  const dir = receiptIssuedDir();
  mkdirSync(dir, { recursive: true });
  const relative = `receipt-qr/issued/${verified.payload.receipt.receipt_id}.json`;
  const absolute = join(getDataDir(), relative);
  writeFileSync(absolute, `${JSON.stringify(verified.payload, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  return relative;
}

export function loadIssuedReceiptPayload(
  receiptId: string,
): SignedReceiptQrPayload | undefined {
  const absolute = join(receiptIssuedDir(), `${receiptId}.json`);
  if (!existsSync(absolute)) return undefined;
  const raw = JSON.parse(readFileSync(absolute, "utf-8")) as unknown;
  const verified = verifySignedReceiptPayload(raw);
  return verified.ok ? verified.payload : undefined;
}

/**
 * Prefer issued snapshot (includes claim_key); fall back to claimant snapshot.
 */
export function loadSignedReceiptForPdf(
  receiptId: string,
): SignedReceiptQrPayload {
  const issued = loadIssuedReceiptPayload(receiptId);
  if (issued) return issued;
  const snap = loadReceiptSnapshot(`receipt-qr/snapshots/${receiptId}.json`);
  if (snap) return snap;
  throw new Error(
    `Signed receipt payload not found for ${receiptId} (issued or snapshot)`,
  );
}

export type ReceiptRegistryIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

/** Soft integrity for `data/receipt-qr/receipts.yaml` (missing file = no issues). */
export function validateReceiptRegistryIntegrity(): ReceiptRegistryIntegrityIssue[] {
  const filePath = "data/receipt-qr/receipts.yaml";
  const absolute = receiptRegistryPath();
  if (!existsSync(absolute)) return [];
  const issues: ReceiptRegistryIntegrityIssue[] = [];
  let registry: ReceiptRegistry;
  try {
    registry = loadReceiptRegistry();
  } catch (error) {
    issues.push({
      level: "error",
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return issues;
  }
  const seen = new Set<string>();
  for (const row of registry.receipts) {
    if (seen.has(row.receipt.receipt_id)) {
      issues.push({
        level: "error",
        file: filePath,
        message: `duplicate receipt_id ${row.receipt.receipt_id}`,
      });
    }
    seen.add(row.receipt.receipt_id);
    if (!/^[a-f0-9]{64}$/.test(row.claim_key_hash)) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${row.receipt.receipt_id}: invalid claim_key_hash`,
      });
    }
    if (!/^[a-f0-9]{64}$/.test(row.digest)) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${row.receipt.receipt_id}: invalid digest`,
      });
    }
    if (
      row.claim_status === "claim_pending_approval" &&
      !row.claim_approval_id
    ) {
      issues.push({
        level: "error",
        file: filePath,
        message: `${row.receipt.receipt_id}: pending claim missing claim_approval_id`,
      });
    }
    if (row.claim_status === "claim_rejected" && !row.claim_reject_reason) {
      issues.push({
        level: "warning",
        file: filePath,
        message: `${row.receipt.receipt_id}: rejected claim missing reason`,
      });
    }
    const issuedPath = join(
      receiptIssuedDir(),
      `${row.receipt.receipt_id}.json`,
    );
    if (!existsSync(issuedPath)) {
      issues.push({
        level: "warning",
        file: filePath,
        message: `${row.receipt.receipt_id}: issued payload missing (PDF regenerate may fail)`,
      });
    }
  }
  return issues;
}

export function findStoredReceipt(
  receiptId: string,
): StoredReceipt | undefined {
  return loadReceiptRegistry().receipts.find(
    (row) => row.receipt.receipt_id === receiptId,
  );
}

export function parseReceiptIssueInputFile(path: string): ReceiptIssueInput {
  const raw = readFileSync(path, "utf-8");
  const parsed = path.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  return receiptIssueInputSchema.parse(parsed);
}

const RECEIPT_CLAIM_AMOUNT_LEAK_KEYS = [
  "amount",
  "total_amount",
  "lines",
  "tax_totals",
  "amount_including_tax",
  "amount_excluding_tax",
] as const;

/** ADR 0032 — inbound Wire claim must reject amount/line fields defensively. */
export function forbiddenAmountFieldInReceiptClaimPayload(
  payload: Record<string, unknown>,
): string | null {
  for (const key of RECEIPT_CLAIM_AMOUNT_LEAK_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return key;
  }
  return null;
}

export function handleReceiptClaimApi(raw: string): {
  status: number;
  body: Record<string, unknown>;
} {
  let envelope: EventEnvelope;
  try {
    envelope = eventEnvelopeSchema.parse(JSON.parse(raw));
  } catch {
    return { status: 400, body: { ok: false, error: "invalid_envelope" } };
  }
  if (envelope.event.type !== "steward.receipt.claim.requested") {
    return { status: 422, body: { ok: false, error: "unexpected_event_type" } };
  }
  const peer = findPeerByOrgRef(envelope.origin);
  if (!peer?.protocol_public_key || !envelope.signature) {
    return {
      status: 401,
      body: { ok: false, error: "authenticated_ooo_required" },
    };
  }
  const verified = verifyInboundProtocolEnvelope(envelope);
  if (!verified.ok) {
    return {
      status: 401,
      body: { ok: false, error: verified.issues.join("; ") },
    };
  }
  const leak = forbiddenAmountFieldInReceiptClaimPayload(
    envelope.event.payload as Record<string, unknown>,
  );
  if (leak) {
    return {
      status: 422,
      body: {
        ok: false,
        error: "amount_fields_forbidden",
        detail: `Wire receipt claim must not include ${leak} (ADR 0032)`,
      },
    };
  }
  const receiptId = envelope.event.payload.receipt_id;
  const claimKey = envelope.event.payload.claim_key;
  const receiptDigest = envelope.event.payload.receipt_digest;
  if (
    typeof receiptId !== "string" ||
    typeof claimKey !== "string" ||
    typeof receiptDigest !== "string"
  ) {
    return {
      status: 422,
      body: {
        ok: false,
        error: "receipt_id, receipt_digest and claim_key required",
      },
    };
  }
  try {
    const result = claimReceipt({
      receiptId,
      claimKey,
      claimantPeerId: peer.peer_id,
      claimantOrgId: envelope.origin.org_id,
      proposedBy: `wire:${envelope.origin.org_id}`,
      requestEventId: envelope.event_id,
      receiptDigest,
    });
    return {
      status: result.idempotent ? 200 : 202,
      body: {
        ok: true,
        receipt_id: receiptId,
        status: result.receipt.claim_status,
        approval_id: result.approvalId,
        idempotent: result.idempotent,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = message.includes("already been consumed");
    return {
      status: conflict ? 409 : 400,
      body: { ok: false, error: message },
    };
  }
}

export async function claimReceiptRemotely(
  payload: SignedReceiptQrPayload,
  fetchFn: typeof fetch = fetch,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  event_id: string;
}> {
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(verified.reason ?? "invalid receipt payload");
  }
  const endpointRaw = verified.payload.receipt.claim?.endpoint;
  if (!endpointRaw) {
    throw new Error("Receipt claim.endpoint is required for Wire claim");
  }
  const endpoint = new URL(endpointRaw);
  const localDemo =
    endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (endpoint.protocol !== "https:" && !localDemo) {
    throw new Error(
      "Remote receipt claim requires HTTPS (HTTP is allowed only for localhost demo)",
    );
  }
  const origin = ourOrgRef();
  const eventId = randomUUID();
  const wirePayload: Record<string, string> = {
    receipt_id: verified.payload.receipt.receipt_id,
    receipt_digest: verified.payload.digest,
  };
  if (verified.payload.receipt.claim?.claim_key) {
    wirePayload.claim_key = verified.payload.receipt.claim.claim_key;
  }
  if (/"amount"|"total_amount"|"lines"/.test(JSON.stringify(wirePayload))) {
    throw new Error("Wire receipt claim must not include amount or lines");
  }
  const envelope = maybeSignEnvelope({
    protocol_version: "1",
    event_id: eventId,
    occurred_at: new Date().toISOString(),
    origin,
    destination: { org_id: verified.payload.receipt.issuer.org_id },
    identity: { org_ref: origin },
    event: {
      type: "steward.receipt.claim.requested",
      payload: wirePayload,
    },
    signature: null,
  });
  if (!envelope.signature) {
    throw new Error("Claimant OOO protocol signing key is required");
  }
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = { ok: false, error: "invalid_json_response" };
  }
  return { status: response.status, body, event_id: eventId };
}
