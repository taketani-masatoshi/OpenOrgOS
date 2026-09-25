import { z } from "zod";

/** Channel-neutral filing vocabulary. e-Tax and eLTAX both use these states. */
export const filingChannelSchema = z.enum(["etax", "eltax"]);
export type FilingChannel = z.output<typeof filingChannelSchema>;

export const filingKindSchema = z.enum(["original", "amended", "corrected"]);
export type FilingKind = z.output<typeof filingKindSchema>;

export const filingEnvironmentSchema = z.enum(["mock", "test", "production"]);
export type FilingEnvironment = z.output<typeof filingEnvironmentSchema>;

export const filingStatusSchema = z.enum([
  "DRAFT",
  "GENERATED",
  "SCHEMA_VALID",
  "BUSINESS_RULE_VALID",
  "APPROVED",
  "SIGNED",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "RECEIVED_BY_ETAX",
  "REJECTED_BY_ETAX",
  "TRANSPORT_ERROR",
]);
export type FilingStatus = z.output<typeof filingStatusSchema>;

export const filingLookupStatusSchema = z.enum(["found", "not_found", "unknown"]);
export type FilingLookupStatus = z.output<typeof filingLookupStatusSchema>;

export const ETAX_PACKAGE_SCHEMA = "orgos.jp.etax-official-package.v1";
export const ELTAX_PACKAGE_SCHEMA = "orgos.jp.eltax-official-package.v1";

export const filingPackageSchemaId = z.enum([ETAX_PACKAGE_SCHEMA, ELTAX_PACKAGE_SCHEMA]);
export type FilingPackageSchemaId = z.output<typeof filingPackageSchemaId>;

export const DEFAULT_RETENTION_YEARS = 10;

export const implementationScoreItemIds = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M8",
  "M9",
  "M10",
  "M11",
  "M12",
  "M13",
] as const;
export type ImplementationScoreItemId = (typeof implementationScoreItemIds)[number];
