import { z } from "zod";
import { agentId } from "./classification.js";

export const missionTypeSchema = z.enum([
  "order",
  "report",
  "pulse_report",
  "work_order_complete",
]);

export const missionStatusSchema = z.enum(["ordered", "in_progress", "completed", "cancelled"]);

export const relayStatusSchema = z.enum(["pending", "ack", "forwarded", "skipped"]);

export const orderSourceSchema = z.enum(["cli", "work_order", "ceo", "steward", "coo", "pulse"]);

export const relayLegSchema = z.object({
  status: relayStatusSchema,
  ack_at: z.string().optional(),
  notes: z.string().optional(),
});

export const agentMissionOrderSchema = z.object({
  from_actor: z.string(),
  source: orderSourceSchema,
  requirements: z.string().optional(),
  linked_work_order_id: z.string().optional(),
});

export const agentMissionReportSchema = z.object({
  summary: z.string(),
  summary_path: z.string().optional(),
  submitted_at: z.string(),
});

export const agentMissionSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^MS-\d{8}-\d{3,6}$/),
  created_at: z.string(),
  tenant: z.string(),
  type: missionTypeSchema,
  status: missionStatusSchema,
  field_agent: agentId,
  subject: z.string(),
  order: agentMissionOrderSchema.optional(),
  report: agentMissionReportSchema.optional(),
  relay: z.object({
    coo: relayLegSchema,
    steward: relayLegSchema,
  }),
});

export type AgentMission = z.output<typeof agentMissionSchema>;
export type MissionType = z.output<typeof missionTypeSchema>;
export type MissionStatus = z.output<typeof missionStatusSchema>;
export type RelayStatus = z.output<typeof relayStatusSchema>;

export const chainPolicySchema = z.object({
  version: z.string(),
  hub_agent: agentId.default("coo"),
  executive_agent: agentId.default("executive_steward"),
  excluded_from_field: z.array(agentId).default(["executive_steward", "coo"]),
  auto_forward_pulse: z.boolean().default(true),
  auto_forward_work_order_complete: z.boolean().default(true),
});

export type ChainPolicy = z.output<typeof chainPolicySchema>;
