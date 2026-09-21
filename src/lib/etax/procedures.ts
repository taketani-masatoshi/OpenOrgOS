import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  etaxProcedureMatrixSchema,
  type EtaxProcedureMatrix,
  type EtaxSupportedProcedure,
} from "../../../schemas/etax/procedures.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_MODULE_ID } from "./constants.js";
import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";

export function etaxProcedureMatrixPath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules",
    ETAX_MODULE_ID,
    "spec",
    "supported-procedures.yaml",
  );
}

export function loadProcedureMatrix(): EtaxProcedureMatrix {
  const path = etaxProcedureMatrixPath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_PROCEDURE_MATRIX_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `Procedure matrix missing: ${path}`,
    });
  }
  return etaxProcedureMatrixSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function lookupProcedure(
  procedureCode: string,
  matrix = loadProcedureMatrix(),
): EtaxSupportedProcedure | undefined {
  return matrix.procedures.find((row) => row.procedureCode === procedureCode);
}

export function assertProcedureAllowed(
  procedureCode: string,
  env: EtaxEnvironment,
  matrix = loadProcedureMatrix(),
): EtaxSupportedProcedure {
  const row = lookupProcedure(procedureCode, matrix);
  if (!row || row.support === "UNSUPPORTED") {
    throw etaxError({
      code: "ETAX_UNSUPPORTED_PROCEDURE",
      field: "procedureCode",
      blocked: "UNSUPPORTED_PROCEDURE",
      message: `Procedure ${procedureCode} is not in the OpenOrgOS supported matrix (fail closed; no XML guess)`,
    });
  }
  if (env === "production" && (row.support !== "SUPPORTED" || !row.productionEligible)) {
    throw etaxError({
      code: "ETAX_PROCEDURE_NOT_PRODUCTION",
      field: "procedureCode",
      blocked: "PRODUCTION_DISABLED",
      message: `Procedure ${procedureCode} support=${row.support}; production requires SUPPORTED only`,
    });
  }
  return row;
}
