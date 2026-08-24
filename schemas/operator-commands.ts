import { z } from "zod";
import { operatorPermissionSchema } from "./org/operator.js";

export const commandKindSchema = z.enum(["read", "write", "approval"]);

export const commandArgValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const commandCandidateSchema = z.object({
  skill_id: z.string().min(1),
  label: z.string().min(1),
  cli_display: z.string().min(1),
  kind: commandKindSchema,
  permission: operatorPermissionSchema,
  score: z.number(),
  matched_by: z.array(z.string()).default([]),
});

export const commandPlanStatusSchema = z.enum([
  "ready",
  "needs_confirmation",
  "needs_args",
  "ambiguous",
  "approval_gate",
  "forbidden",
  "not_found",
]);

export const commandPlanSchema = z.object({
  plan_id: z.string().min(1),
  status: commandPlanStatusSchema,
  skill_id: z.string().optional(),
  label: z.string().optional(),
  cli_display: z.string().optional(),
  kind: commandKindSchema.optional(),
  permission: operatorPermissionSchema.optional(),
  args: z.record(z.string(), commandArgValueSchema).default({}),
  missing_args: z.array(z.string()).default([]),
  candidates: z.array(commandCandidateSchema).default([]),
  message: z.string().optional(),
  created_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
});

export const commandCatalogEntrySchema = z.object({
  skill_id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  cli_command: z.string().optional(),
  kind: commandKindSchema,
  permission: operatorPermissionSchema,
  args: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["month", "string", "number", "id", "boolean"]),
        required: z.boolean(),
      })
    )
    .default([]),
});

export const commandRunResultSchema = z.object({
  ok: z.boolean(),
  plan_id: z.string(),
  skill_id: z.string().optional(),
  output: z.string().default(""),
  error: z.string().optional(),
  cli_display: z.string().optional(),
});

export type CommandKind = z.output<typeof commandKindSchema>;
export type CommandCandidate = z.output<typeof commandCandidateSchema>;
export type CommandPlanStatus = z.output<typeof commandPlanStatusSchema>;
export type CommandPlan = z.output<typeof commandPlanSchema>;
export type CommandCatalogEntry = z.output<typeof commandCatalogEntrySchema>;
export type CommandRunResult = z.output<typeof commandRunResultSchema>;
