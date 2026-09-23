import { z } from "zod";

/**
 * T-O2 / transmission-test evidence (gitignore path).
 * receiptNumber must not look like mock or sample login ids.
 */
export const etaxTransmissionEvidenceSchema = z
  .object({
    schema_version: z.literal(1),
    procedureCode: z.literal("RHO0010"),
    env: z.literal("test"),
    receiptNumber: z.string().min(1),
    requestId: z.string().min(1),
    xmlHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    submittedAt: z.string().min(1),
    hostMethodsCalled: z
      .array(z.enum(["SignToReport", "Send", "GetResponse"]))
      .min(1),
    ntaReferenceId: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.receiptNumber.startsWith("MOCK-NOT-NTA-")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "receiptNumber must not use MOCK-NOT-NTA- prefix",
        path: ["receiptNumber"],
      });
    }
    if (val.requestId === "XU00S010" || val.receiptNumber === "XU00S010") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "XU00S010 is a sample login id, not a filing/receipt id",
        path: ["requestId"],
      });
    }
  });

export type EtaxTransmissionEvidence = z.output<typeof etaxTransmissionEvidenceSchema>;

/** NTA completion L1 note (no secrets). */
export const etaxNtaCompletionEvidenceSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("nta_transmission_test_completion"),
  referenceId: z.string().min(1),
  completedOn: z.string().min(1),
  procedureCode: z.literal("RHO0010"),
  notes: z.string().optional(),
});

export type EtaxNtaCompletionEvidence = z.output<typeof etaxNtaCompletionEvidenceSchema>;
