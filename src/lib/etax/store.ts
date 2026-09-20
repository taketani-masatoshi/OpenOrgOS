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
import { submissionIdentityKey } from "./hash.js";

export const etaxSubmissionRecordSchema = z.object({
  id: z.string().regex(/^ETAX-SUB-[A-Za-z0-9_-]+$/),
  packageId: z.string(),
  status: etaxSubmissionStatusSchema,
  contentHash: z.string(),
  xmlHash: z.string().optional(),
  identityKey: z.string(),
  approvalId: z.string().optional(),
  approvalContentHash: z.string().optional(),
  signatureRef: z.string().optional(),
  signatureProvider: z.enum(["mock", "official"]).optional(),
  environment: z.enum(["mock", "test", "production"]).optional(),
  specVersion: z.string(),
});

export type EtaxSubmissionRecord = z.output<typeof etaxSubmissionRecordSchema>;

const packageFileSchema = z.object({
  packages: z.array(returnPackageSchema).default([]),
});

const submissionFileSchema = z.object({
  submissions: z.array(etaxSubmissionRecordSchema).default([]),
});

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

export function identityKeyFor(pkg: ReturnPackage, documentHash: string): string {
  return submissionIdentityKey({
    taxpayerId: pkg.taxpayerId,
    procedureCode: pkg.procedureCode,
    taxYear: pkg.taxYear,
    revision: pkg.revision,
    documentHash,
  });
}
