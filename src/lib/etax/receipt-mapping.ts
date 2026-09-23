import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_SPEC_RELATIVE_DIR } from "./constants.js";
import { etaxError } from "../../../schemas/etax/errors.js";

const receiptFieldSchema = z.object({
  localName: z.string().min(1),
  meaning: z.string().min(1),
  role: z.enum(["receiptNumber", "receivedAt", "receivedTime", "procedureName", "other"]),
});

const receiptMappingSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  specArtifactId: z.literal("e-tax18"),
  sourceWorkbook: z.string().min(1),
  notes: z.string(),
  rootElement: z.string().min(1),
  fields: z.array(receiptFieldSchema).min(1),
});

export type EtaxReceiptMapping = z.output<typeof receiptMappingSchema>;

export function etaxReceiptMappingPath(): string {
  return join(getInstallRoot(), ETAX_SPEC_RELATIVE_DIR, "receipt-mapping.yaml");
}

export function loadReceiptMapping(): EtaxReceiptMapping {
  const path = etaxReceiptMappingPath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_RECEIPT_MAPPING_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `e-tax18 receipt mapping missing: ${path}`,
    });
  }
  return receiptMappingSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export type ParsedReceipt = {
  receiptNumber?: string;
  receivedAt?: string;
  procedureName?: string;
  rootElement?: string;
};

/**
 * Extract receipt fields by local element names from the e-tax18 map.
 * Uses simple tag scan — no invented schema; NTA-secret values never hardcoded.
 * Unknown root elements fail closed (mapping rootElement is required).
 */
export function parseReceiptXml(
  xml: string,
  mapping = loadReceiptMapping(),
): ParsedReceipt {
  const out: ParsedReceipt = {};
  const rootMatch = xml.match(/<(?:[A-Za-z0-9_]+:)?([A-Za-z0-9_]+)[\s>]/);
  if (!rootMatch?.[1]) {
    throw etaxError({
      code: "ETAX_RECEIPT_XML_NO_ROOT",
      blocked: "SPEC_BLOCKED",
      message: "Receipt XML has no parseable root element",
    });
  }
  out.rootElement = rootMatch[1];
  if (out.rootElement !== mapping.rootElement) {
    throw etaxError({
      code: "ETAX_RECEIPT_XML_ROOT_MISMATCH",
      blocked: "SPEC_BLOCKED",
      message:
        `Receipt XML root ${out.rootElement} does not match e-tax18 map root ${mapping.rootElement}. ` +
        "Refusing to invent alternate receipt schemas.",
    });
  }

  for (const field of mapping.fields) {
    const re = new RegExp(
      `<${field.localName}(?:\\s[^>]*)?>([^<]*)</${field.localName}>`,
      "i",
    );
    const m = xml.match(re);
    if (!m?.[1]?.trim()) continue;
    const value = m[1].trim();
    if (field.role === "receiptNumber") out.receiptNumber = value;
    else if (field.role === "receivedAt") out.receivedAt = value;
    else if (field.role === "procedureName") out.procedureName = value;
  }
  return out;
}
