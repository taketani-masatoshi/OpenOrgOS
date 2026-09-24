/**
 * Receipt verify link: `<portal>#v2z.<base64url(deflate(compact JSON))>`.
 * Path: src/lib/receipt-qr/link-codec.ts
 *
 * The compact tuple layout is a wire format shared with the public verify
 * portal — field order must not change. Legacy `v1.` and raw JSON still decode.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { z } from "zod";
import {
  receiptQrDataSchema,
  signedReceiptQrPayloadSchema,
  type SignedReceiptQrPayload,
} from "../../../schemas/receipt-qr.js";
import { canonicalJson } from "../protocol/canonical.js";
import { DEFAULT_RECEIPT_PORTAL_URL } from "./config.js";
import { sha256Hex } from "./signature.js";

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
    digest: sha256Hex(canonicalJson(receipt)),
    signature: compact.g,
    issuer_public_key: compact.p,
  });
}

export function encodeReceiptLink(
  payload: SignedReceiptQrPayload,
  portalUrl = DEFAULT_RECEIPT_PORTAL_URL,
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
