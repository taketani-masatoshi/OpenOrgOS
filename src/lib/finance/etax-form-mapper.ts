import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { etaxCertifiedProductAdapter, type EtaxFormMapper } from "./etax.js";

const mappingSchema = z.object({
  schema: z.literal("orgos.jp.etax-form-mapping.v1"),
  mapping_revision: z.string().min(1),
  root_element: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/),
  namespace: z.string().min(1),
  fields: z.array(z.object({
    element: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/),
    source: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    required: z.boolean().default(false),
  })),
});

type Mapping = z.output<typeof mappingSchema>;
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function getPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Data-driven mapper; certification is granted only when mapping and evidence hashes match. */
export class CatalogEtaxFormMapper implements EtaxFormMapper<Record<string, unknown>> {
  readonly name = "catalog-etax-form-mapper";
  readonly [etaxCertifiedProductAdapter] = true;
  readonly mappingRevision: string;
  readonly certified: boolean;
  private readonly mapping: Mapping;
  constructor(input: {
    mappingPath: string;
    mappingSha256: string;
    certificationEvidencePath: string;
    certificationEvidenceSha256: string;
  }) {
    const mappingBytes = readFileSync(input.mappingPath);
    const evidenceBytes = readFileSync(input.certificationEvidencePath);
    this.certified = digest(mappingBytes) === input.mappingSha256 && digest(evidenceBytes) === input.certificationEvidenceSha256;
    if (!this.certified) throw new Error("e-Tax mapping or certification evidence hash mismatch");
    this.mapping = mappingSchema.parse(JSON.parse(mappingBytes.toString("utf8")));
    this.mappingRevision = this.mapping.mapping_revision;
  }
  map(input: { source: Record<string, unknown> }): string {
    const rows: string[] = [];
    for (const field of this.mapping.fields) {
      const value = getPath(input.source, field.source);
      if ((value === undefined || value === null || value === "") && field.required) {
        throw new Error(`required e-Tax field missing: ${field.source}`);
      }
      if (value !== undefined && value !== null && value !== "") rows.push(`  <${field.element}>${escapeXml(String(value))}</${field.element}>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${this.mapping.root_element} xmlns="${escapeXml(this.mapping.namespace)}">\n${rows.join("\n")}\n</${this.mapping.root_element}>\n`;
  }
}
