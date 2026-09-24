/**
 * Receipt QR issuer configuration (`data/receipt-qr/config.yaml`).
 * Path: src/lib/receipt-qr/config.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { receiptQrConfigSchema } from "../../../schemas/receipt-qr.js";
import { readYamlFile } from "../utils.js";
import { receiptConfigPath } from "./paths.js";

export const DEFAULT_RECEIPT_PORTAL_URL = "https://receipt.oorgos.org/r";

export type ReceiptQrConfigInitInput = {
  claim_base_url: string;
  receipt_portal_url?: string;
  simple_invoice_eligible?: boolean;
  simple_invoice_basis?: string;
  tax_rounding?: "floor" | "round" | "ceil";
};

/** Default used when config.yaml is missing (preview / first-run UX). */
export function defaultReceiptQrConfig() {
  return receiptQrConfigSchema.parse({
    schema: "orgos.jp.receipt.config.v1",
    claim_base_url: "http://127.0.0.1:8787/wire/v1/receipts/claim",
    receipt_portal_url: DEFAULT_RECEIPT_PORTAL_URL,
    simple_invoice_eligible: true,
    simple_invoice_basis: "default until orgos receipt init",
    tax_rounding: "floor",
  });
}

export function loadReceiptQrConfig() {
  const path = receiptConfigPath();
  if (!existsSync(path))
    throw new Error(`Receipt QR config not found: ${path}`);
  return readYamlFile(path, receiptQrConfigSchema);
}

/** Prefer tenant config; fall back to defaults (does not write disk). */
export function loadReceiptConfigOrDefault() {
  const path = receiptConfigPath();
  if (!existsSync(path)) return defaultReceiptQrConfig();
  return loadReceiptQrConfig();
}

export function receiptPortalUrl(): string {
  return loadReceiptConfigOrDefault().receipt_portal_url;
}

export function trimClaimBaseUrl(claimBaseUrl: string): string {
  return claimBaseUrl.replace(/\/$/, "");
}

/** Claims are only accepted on this issuer's configured Wire endpoint. */
export function assertClaimEndpointUnderBase(
  claimEndpoint: string,
  claimBaseUrl: string,
): void {
  if (!claimEndpoint.startsWith(trimClaimBaseUrl(claimBaseUrl))) {
    throw new Error("claim_endpoint must be under the configured claim_base_url");
  }
}

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
    claim_base_url: trimClaimBaseUrl(input.claim_base_url),
    receipt_portal_url: input.receipt_portal_url ?? DEFAULT_RECEIPT_PORTAL_URL,
    simple_invoice_eligible: input.simple_invoice_eligible ?? false,
    simple_invoice_basis: input.simple_invoice_basis,
    tax_rounding: input.tax_rounding ?? "floor",
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), { encoding: "utf-8", mode: 0o600 });
  return path;
}
