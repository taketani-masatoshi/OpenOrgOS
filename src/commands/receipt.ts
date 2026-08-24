import { resolve } from "node:path";
import { setTenantId } from "../lib/tenant.js";
import {
  auditCliMutation,
  requireCliConfigWrite,
  requireCliOperator,
} from "../lib/console-auth/cli-operator.js";
import {
  decodeReceiptLink,
  encodeReceiptLink,
  findStoredReceipt,
  initReceiptQrConfig,
  issueReceipt,
  loadIssuedReceiptPayload,
  loadReceiptQrConfig,
  loadReceiptRegistry,
  loadSignedReceiptForPdf,
  parseReceiptIssueInputFile,
  receiptPortalUrl,
  verifySignedReceiptPayload,
  type ReceiptIssueInput,
} from "../lib/receipt-qr.js";
import { generateReceiptPdf } from "../lib/receipt-pdf.js";
import { renderReceiptQrSvg } from "../lib/receipt-qr-render.js";
import { readFileSync, existsSync } from "node:fs";
import type { receiptClaimStatusSchema } from "../../schemas/receipt-qr.js";
import type { z } from "zod";

type ClaimStatus = z.output<typeof receiptClaimStatusSchema>;

function withTenant(tenant: string | undefined): void {
  if (tenant) setTenantId(tenant);
}

export function runReceiptInit(opts: {
  tenant?: string;
  claimBaseUrl: string;
  portalUrl?: string;
  simpleEligible?: boolean;
  simpleBasis?: string;
  force?: boolean;
}): void {
  withTenant(opts.tenant);
  requireCliConfigWrite("receipt init");
  const path = initReceiptQrConfig(
    {
      claim_base_url: opts.claimBaseUrl,
      receipt_portal_url: opts.portalUrl,
      simple_invoice_eligible: opts.simpleEligible ?? false,
      simple_invoice_basis: opts.simpleBasis,
    },
    { force: opts.force },
  );
  auditCliMutation("receipt init", path);
  console.log(`✓ Receipt QR config written: ${path}`);
}

export async function runReceiptIssue(opts: {
  tenant?: string;
  file: string;
  pdf?: string;
  json?: boolean;
}): Promise<void> {
  withTenant(opts.tenant);
  requireCliOperator({ permission: "receipt:issue", command: "receipt issue" });
  const input: ReceiptIssueInput = parseReceiptIssueInputFile(
    resolve(opts.file),
  );
  const result = issueReceipt(input);
  const portal = receiptPortalUrl();
  const link = encodeReceiptLink(result.qrPayload, portal);
  const svg = await renderReceiptQrSvg(link);
  let pdfPath: string | undefined;
  if (opts.pdf) {
    pdfPath = resolve(opts.pdf);
    await generateReceiptPdf(result.qrPayload, pdfPath, { portalUrl: portal });
  }
  auditCliMutation(
    "receipt issue",
    `${result.stored.receipt.receipt_id} ${result.stored.digest.slice(0, 12)}`,
  );
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          receipt_id: result.stored.receipt.receipt_id,
          digest: result.stored.digest,
          total_amount: result.stored.receipt.total_amount,
          qr_link: link,
          qr_svg: svg,
          pdf_path: pdfPath,
          claim_status: result.stored.claim_status,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`✓ Issued ${result.stored.receipt.receipt_id}`);
  console.log(`  digest: ${result.stored.digest}`);
  console.log(`  total:  ¥${result.stored.receipt.total_amount.toLocaleString("ja-JP")}`);
  console.log(`  link:   ${link}`);
  if (pdfPath) console.log(`  pdf:    ${pdfPath}`);
}

export function runReceiptList(opts: {
  tenant?: string;
  status?: string;
  json?: boolean;
}): void {
  withTenant(opts.tenant);
  const registry = loadReceiptRegistry();
  let rows = registry.receipts;
  if (opts.status) {
    rows = rows.filter((r) => r.claim_status === opts.status);
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, receipts: rows }, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("(no receipts)");
    return;
  }
  for (const row of rows) {
    console.log(
      `${row.receipt.receipt_id}  ${row.claim_status.padEnd(22)}  ¥${row.receipt.total_amount.toLocaleString("ja-JP")}  ${row.digest.slice(0, 12)}…`,
    );
  }
}

export function runReceiptShow(opts: {
  tenant?: string;
  id: string;
  json?: boolean;
}): void {
  withTenant(opts.tenant);
  const row = findStoredReceipt(opts.id);
  if (!row) {
    console.error(`Receipt not found: ${opts.id}`);
    process.exitCode = 1;
    return;
  }
  const issued = loadIssuedReceiptPayload(opts.id);
  if (opts.json) {
    console.log(
      JSON.stringify({ ok: true, stored: row, issued_payload: issued }, null, 2),
    );
    return;
  }
  console.log(`receipt_id:     ${row.receipt.receipt_id}`);
  console.log(`document_type:  ${row.receipt.document_type}`);
  console.log(`issuer:         ${row.receipt.issuer.name}`);
  console.log(`T番号:          ${row.receipt.issuer.invoice_registration_number}`);
  console.log(`transaction:    ${row.receipt.transaction_date}`);
  console.log(`total:          ¥${row.receipt.total_amount.toLocaleString("ja-JP")}`);
  console.log(`claim_status:   ${row.claim_status}`);
  console.log(`digest:         ${row.digest}`);
  if (row.claimed_by_org_id) console.log(`claimed_by:     ${row.claimed_by_org_id}`);
  if (row.claim_approval_id) console.log(`approval_id:    ${row.claim_approval_id}`);
  if (row.claim_reject_reason) console.log(`reject_reason:  ${row.claim_reject_reason}`);
  for (const line of row.receipt.lines) {
    console.log(
      `  - ${line.description}  ¥${line.amount_including_tax.toLocaleString("ja-JP")} (${line.tax_rate}%)`,
    );
  }
}

export async function runReceiptPdf(opts: {
  tenant?: string;
  id: string;
  out: string;
}): Promise<void> {
  withTenant(opts.tenant);
  requireCliOperator({ permission: "receipt:issue", command: "receipt pdf" });
  const payload = loadSignedReceiptForPdf(opts.id);
  const out = resolve(opts.out);
  await generateReceiptPdf(payload, out);
  auditCliMutation("receipt pdf", `${opts.id} → ${out}`);
  console.log(`✓ PDF written: ${out}`);
}

export function runReceiptVerify(opts: {
  tenant?: string;
  input: string;
  json?: boolean;
}): void {
  withTenant(opts.tenant);
  let payload;
  const value = opts.input.trim();
  if (existsSync(value)) {
    const raw = JSON.parse(readFileSync(value, "utf-8")) as unknown;
    payload = verifySignedReceiptPayload(raw);
  } else if (value.includes("#") || value.startsWith("v2z.") || value.startsWith("{")) {
    try {
      const decoded = value.startsWith("{")
        ? verifySignedReceiptPayload(JSON.parse(value))
        : { ok: true as const, payload: decodeReceiptLink(value) };
      if (decoded.ok && "payload" in decoded && decoded.payload) {
        payload = verifySignedReceiptPayload(decoded.payload);
      } else {
        payload = { ok: false as const, reason: "decode_failed" };
      }
    } catch (error) {
      payload = {
        ok: false as const,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    payload = { ok: false as const, reason: "unsupported_input" };
  }

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    if (!payload.ok) process.exitCode = 1;
    return;
  }
  if (!payload.ok || !payload.payload) {
    console.error(`✗ Invalid: ${payload.reason ?? "unknown"}`);
    process.exitCode = 1;
    return;
  }
  const r = payload.payload.receipt;
  console.log(`✓ Valid signature`);
  console.log(`  receipt_id: ${r.receipt_id}`);
  console.log(`  issuer:     ${r.issuer.name}`);
  console.log(`  total:      ¥${r.total_amount.toLocaleString("ja-JP")}`);
  console.log(`  digest:     ${payload.payload.digest}`);
}

export function runReceiptConfigShow(opts: {
  tenant?: string;
  json?: boolean;
}): void {
  withTenant(opts.tenant);
  const config = loadReceiptQrConfig();
  if (opts.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  console.log(`claim_base_url:     ${config.claim_base_url}`);
  console.log(`receipt_portal_url: ${config.receipt_portal_url}`);
  console.log(`simple_eligible:    ${config.simple_invoice_eligible}`);
  console.log(`tax_rounding:       ${config.tax_rounding}`);
}

/** Exported for tests / filters. */
export type { ClaimStatus };
