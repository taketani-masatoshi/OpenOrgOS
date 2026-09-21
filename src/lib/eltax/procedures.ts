import { filingError } from "../efiling/errors.js";

/** Every eLTAX procedure stays UNSUPPORTED until a local-tax spec is registered. */
export function assertEltaxProcedureAllowed(procedureCode: string): void {
  throw filingError(
    "ELTAX_PROCEDURE_UNSUPPORTED",
    `eLTAX procedure ${procedureCode} is UNSUPPORTED. Refusing to file.`,
    "SPEC_BLOCKED",
  );
}
