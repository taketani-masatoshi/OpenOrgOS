import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { returnPackageSchema, type ReturnPackage } from "../../../schemas/etax/return-package.js";
import { etaxSubmissionStatusSchema } from "../../../schemas/etax/submission-state.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { wrapCanonicalWrite } from "../org/fs-guard/write-hook.js";
import { readYamlFile } from "../utils.js";
import { resolveModuleDataFile } from "../module-business-data.js";
import { ETAX_MODULE_ID } from "./constants.js";
import { submissionSlotKey } from "./hash.js";

export const etaxXmlProvenanceSchema = z.enum(["generated", "imported-validated"]);

export const etaxSubmissionRecordSchema = z.object({
  id: z.string().regex(/^ETAX-SUB-[A-Za-z0-9_-]+$/),
  packageId: z.string(),
  status: etaxSubmissionStatusSchema,
  contentHash: z.string(),
  xmlHash: z.string().optional(),
  xmlProvenance: etaxXmlProvenanceSchema.optional(),
  /** Slot key = taxpayer|procedure|year|revision (no content hash). */
  identityKey: z.string(),
  approvalId: z.string().optional(),
  approvalContentHash: z.string().optional(),
  signatureRef: z.string().optional(),
  signatureProvider: z.enum(["mock", "official"]).optional(),
  signatureLegal: z.boolean().optional(),
  signatureDocumentHash: z.string().optional(),
  signatureHash: z.string().optional(),
  environment: z.enum(["mock", "test", "production"]).optional(),
  requestId: z.string().optional(),
  receiptNumber: z.string().optional(),
  receiptHash: z.string().optional(),
  specVersion: z.string(),
});

export type EtaxSubmissionRecord = z.output<typeof etaxSubmissionRecordSchema>;
export type EtaxXmlProvenance = z.output<typeof etaxXmlProvenanceSchema>;

const packageFileSchema = z.object({
  packages: z.array(returnPackageSchema).default([]),
});

const submissionFileSchema = z.object({
  submissions: z.array(etaxSubmissionRecordSchema).default([]),
});

const ACTIVE_SLOT_STATUSES = new Set([
  "GENERATED",
  "SCHEMA_VALID",
  "BUSINESS_RULE_VALID",
  "APPROVED",
  "SIGNED",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "RECEIVED_BY_ETAX",
  "TRANSPORT_ERROR",
]);

export function etaxPackagesPath(): string {
  return resolveModuleDataFile(ETAX_MODULE_ID, "packages.yaml");
}

export function etaxSubmissionsPath(): string {
  return resolveModuleDataFile(ETAX_MODULE_ID, "submissions.yaml");
}

export function loadReturnPackages(): ReturnPackage[] {
  const path = etaxPackagesPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, packageFileSchema).packages;
}

export function loadSubmissions(): EtaxSubmissionRecord[] {
  const path = etaxSubmissionsPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, submissionFileSchema).submissions;
}

function writeYaml(path: string, data: unknown): void {
  wrapCanonicalWrite(path, () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, YAML.stringify(data), "utf-8");
  });
}

export function saveReturnPackage(pkg: ReturnPackage): ReturnPackage {
  const packages = loadReturnPackages().filter((row) => row.id !== pkg.id);
  packages.push(pkg);
  writeYaml(etaxPackagesPath(), { packages });
  return pkg;
}

export function saveSubmission(row: EtaxSubmissionRecord): EtaxSubmissionRecord {
  const submissions = loadSubmissions().filter((item) => item.id !== row.id);
  submissions.push(row);
  writeYaml(etaxSubmissionsPath(), { submissions });
  return row;
}

export function findReturnPackage(id: string): ReturnPackage | undefined {
  return loadReturnPackages().find((row) => row.id === id);
}

export function findSubmission(id: string): EtaxSubmissionRecord | undefined {
  return loadSubmissions().find((row) => row.id === id);
}

export function findSubmissionByIdentity(identityKey: string): EtaxSubmissionRecord | undefined {
  return loadSubmissions().find((row) => row.identityKey === identityKey);
}

export function findActiveSubmissionInSlot(slotKey: string): EtaxSubmissionRecord | undefined {
  return loadSubmissions().find(
    (row) => row.identityKey === slotKey && ACTIVE_SLOT_STATUSES.has(row.status),
  );
}

export function requireReturnPackage(id: string): ReturnPackage {
  const pkg = findReturnPackage(id);
  if (!pkg) {
    throw etaxError({
      code: "ETAX_PACKAGE_NOT_FOUND",
      field: "id",
      message: `ReturnPackage not found: ${id}`,
    });
  }
  return pkg;
}

export function requireSubmission(id: string): EtaxSubmissionRecord {
  const row = findSubmission(id);
  if (!row) {
    throw etaxError({
      code: "ETAX_SUBMISSION_NOT_FOUND",
      field: "id",
      message: `Submission not found: ${id}`,
    });
  }
  return row;
}

/** Slot key for duplicate detection (no document hash). */
export function identityKeyFor(pkg: ReturnPackage): string {
  return submissionSlotKey({
    taxpayerId: pkg.taxpayerId,
    procedureCode: pkg.procedureCode,
    taxYear: pkg.taxYear,
    revision: pkg.revision,
  });
}
