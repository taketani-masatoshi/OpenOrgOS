import { z } from "zod";

export const etaxBlockedReasonSchema = z.enum([
  "SPEC_BLOCKED",
  "PHASE_NOT_IMPLEMENTED",
  "PRODUCTION_DISABLED",
  "UNSUPPORTED_PROCEDURE",
  "HASH_MISMATCH",
  "DUPLICATE_SUBMISSION",
]);

export const etaxErrorSchema = z.object({
  code: z.string().min(1),
  field: z.string().optional(),
  rule: z.string().optional(),
  specVersion: z.string().optional(),
  message: z.string().min(1),
  blocked: etaxBlockedReasonSchema.optional(),
});

export type EtaxBlockedReason = z.output<typeof etaxBlockedReasonSchema>;
export type EtaxError = z.output<typeof etaxErrorSchema>;

export class EtaxException extends Error {
  readonly etax: EtaxError;

  constructor(error: EtaxError) {
    super(error.message);
    this.name = "EtaxException";
    this.etax = error;
  }
}

export function etaxError(error: EtaxError): EtaxException {
  return new EtaxException(etaxErrorSchema.parse(error));
}
