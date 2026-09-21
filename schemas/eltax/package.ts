import { z } from "zod";
import { ELTAX_PACKAGE_SCHEMA } from "../efiling/filing.js";

/** eLTAX package envelope. Must not be accepted by the e-Tax store or XML generator. */
export const eltaxOfficialPackageSchema = z.object({
  schema: z.literal(ELTAX_PACKAGE_SCHEMA),
  taxpayerId: z.string().min(1),
  procedureCode: z.string().min(1),
  taxYear: z.string().min(1),
  payload: z.unknown(),
});

export type EltaxOfficialPackage = z.output<typeof eltaxOfficialPackageSchema>;
