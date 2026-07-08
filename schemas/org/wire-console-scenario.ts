import { z } from "zod";

export const wireConsoleScenarioSchema = z.object({
  as_of: z.string(),
  scenario_id: z.string(),
  title: z.string(),
  org_role: z.enum(["sender", "receiver", "witness"]),
  org_role_ja: z.string(),
  counterparty_label: z.string(),
  contract_id: z.string().optional(),
  flow_steps: z.array(z.string()),
  anchors: z.object({
    inter_org_event_id: z.string(),
    ack_event_id: z.string().optional(),
  }),
  mail_hints: z.object({
    inbox: z.string().optional(),
    outbox: z.string().optional(),
    pending: z.string().optional(),
    witness: z.string().optional(),
    threads: z.string().optional(),
  }),
  witness: z
    .object({
      anchor_event_id: z.string(),
      hub_ids: z.array(z.string()),
      this_org_side: z.enum(["sent", "received", "none"]).optional(),
      note: z.string().optional(),
    })
    .optional(),
});

export type WireConsoleScenario = z.infer<typeof wireConsoleScenarioSchema>;
