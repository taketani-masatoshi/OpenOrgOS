export const ETAX_MODULE_ID = "jp_etax";

export const ETAX_SPEC_FAMILY = "ksk2" as const;

export const ETAX_BASELINE_SPEC_VERSION = "KSK2-2026-08-28";

export const ETAX_COMPATIBILITY_STATUS =
  "EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION";

export const ETAX_PRODUCTION_BANNER =
  "e-Tax production submission: NOT CERTIFIED / DISABLED";

export const ETAX_SPEC_RELATIVE_DIR =
  "steward/jurisdiction-packs/JP/modules/jp_etax/spec";

/** CAB ids that must be on disk with matching SHA for ksk2SpecRegistered(). */
export const ETAX_REQUIRED_SPEC_ARTIFACT_IDS = [
  "e-tax01",
  "e-tax04",
  "e-tax05",
  "e-tax07",
  "e-tax08",
  "e-tax10",
  "e-tax19",
] as const;
