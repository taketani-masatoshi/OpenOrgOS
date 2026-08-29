#!/usr/bin/env npx tsx
/**
 * Seed a demo receipt-qr config + one issued receipt for local UI/CLI checks.
 *
 * Usage:
 *   npx tsx scripts/seed-receipt-qr-demo.ts --tenant demo
 */
import { parseArgs } from "node:util";
import { setTenantId } from "../src/lib/tenant.js";
import {
  encodeReceiptLink,
  initReceiptQrConfig,
  issueReceipt,
  loadReceiptQrConfig,
  receiptPortalUrl,
} from "../src/lib/receipt-qr.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/lib/utils.js";

const { values } = parseArgs({
  options: {
    tenant: { type: "string", default: "demo" },
    "claim-base-url": {
      type: "string",
      default: "http://127.0.0.1:8787/wire/v1/receipts/claim",
    },
    force: { type: "boolean", default: false },
  },
});

setTenantId(values.tenant ?? "demo");

const configPath = join(getDataDir(), "receipt-qr", "config.yaml");
if (!existsSync(configPath) || values.force) {
  initReceiptQrConfig(
    {
      claim_base_url: values["claim-base-url"]!,
      receipt_portal_url: "https://receipt.oorgos.org/r",
      simple_invoice_eligible: true,
      simple_invoice_basis: "demo simplified-invoice eligibility",
    },
    { force: true },
  );
  console.log(`✓ config: ${configPath}`);
} else {
  console.log(`· config exists: ${configPath}`);
  void loadReceiptQrConfig();
}

const result = issueReceipt({
  document_type: "qualified_invoice",
  transaction_date: new Date().toISOString().slice(0, 10),
  recipient_name: "取引先デモ",
  lines: [
    {
      description: "デモ消耗品",
      quantity: 1,
      tax_rate: 10,
      reduced_tax: false,
      amount_excluding_tax: 2000,
      tax_amount: 200,
      amount_including_tax: 2200,
    },
  ],
  claim_endpoint: values["claim-base-url"]!,
});

const link = encodeReceiptLink(result.qrPayload, receiptPortalUrl());
console.log(`✓ issued ${result.stored.receipt.receipt_id}`);
console.log(`  link ${link}`);
console.log(`  Open Steward Chat → 予実 → 領収書発行 / 領収書 claim`);
