import { z } from "zod";
import { dateString } from "./common.js";

/**
 * Requirements are finer-grained than controls. A control such as "risk
 * approach" can be in place while a specific shall-statement under the same
 * clause goes unaddressed, and coverage at clause level hides that.
 *
 * ISO text cannot be redistributed, so `statement` is a paraphrase written by
 * the pack author. Until someone checks it against a licensed copy and fills in
 * `verified_on`, coverage results describe conformance to our reading of the
 * standard — not to the standard. Same contract as `orgos iso clauses`.
 */

export const isoRequirementSource = z.enum(["paraphrase", "verified_quote"]);

export const isoRequirementSchema = z.object({
  id: z.string().min(1),
  clause: z.string().min(1),
  statement: z.string().min(1),
  source: isoRequirementSource.default("paraphrase"),
  /** Date the wording was checked against the purchased standard text. */
  verified_on: dateString.optional(),
  verified_by: z.string().optional(),
  /** Controls that, taken together, are claimed to satisfy the requirement. */
  controls: z.array(z.string().min(1)).default([]),
  note: z.string().optional(),
});

export const isoRequirementsFileSchema = z.object({
  version: z.string().default("1"),
  standard: z.string().min(1),
  requirements: z.array(isoRequirementSchema).default([]),
});

export type IsoRequirementSource = z.output<typeof isoRequirementSource>;
export type IsoRequirement = z.output<typeof isoRequirementSchema>;
export type IsoRequirementsFile = z.output<typeof isoRequirementsFileSchema>;
