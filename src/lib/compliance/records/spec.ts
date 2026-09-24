import { existsSync } from "node:fs";
import {
  isoRecordSpecFileSchema,
  type IsoRecordSeverity,
  type IsoRecordSpec,
  type IsoRecordSpecFile,
} from "../../../../schemas/iso-record-spec.js";
import { packFilePath, tenantEvidenceRel } from "../packs/paths.js";
import { readYamlFile } from "../../utils.js";

export const RECORD_SPEC_FILE = "records.yaml";

export interface IsoRecordIssue {
  standard: string;
  file: string;
  /** 1-based data row, absent for whole-file faults. */
  row?: number;
  severity: IsoRecordSeverity;
  message: string;
}

export interface IsoRecordReport {
  standard: string;
  file: string;
  title: string;
  exists: boolean;
  /** Data rows for a CSV; not meaningful for Markdown. */
  rows: number;
  issues: IsoRecordIssue[];
}

export function recordSpecPath(standard: string): string {
  return packFilePath(standard, RECORD_SPEC_FILE);
}

export function loadRecordSpecs(standard: string): IsoRecordSpecFile | undefined {
  const path = recordSpecPath(standard);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, isoRecordSpecFileSchema);
}

/**
 * Tenant path of the record a spec describes. Kept in records (not templates)
 * so the control framework can depend on this module without pulling in the catalog.
 */
export function recordRelPath(standard: string, spec: IsoRecordSpec): string {
  return spec.tenant_path ?? `${tenantEvidenceRel(standard)}/${spec.file}`;
}
