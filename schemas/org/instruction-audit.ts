import { z } from "zod";

export const instructionAuditActionSchema = z.enum([
  "chat.message",
  "mcp.tool",
  "agent.dispatch",
  "escalate.run",
  "cli.mutation",
  "access.grant",
  "access.revoke",
  "other",
]);

export const instructionAuditEntrySchema = z.object({
  at: z.string().min(1),
  actor_operator_id: z.string().min(1),
  action: instructionAuditActionSchema,
  ok: z.boolean(),
  agent_id: z.string().optional(),
  grant_id: z.string().optional(),
  correlation_id: z.string().optional(),
  detail_redacted: z.string().optional(),
});

export type InstructionAuditAction = z.output<typeof instructionAuditActionSchema>;
export type InstructionAuditEntry = z.output<typeof instructionAuditEntrySchema>;
