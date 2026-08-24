import { z } from "zod";
import { dateString } from "../common.js";

export const fundingHandoffSchema = z.object({
  handoff_id: z.string().min(1),
  to_agent: z.enum([
    "finance",
    "legal",
    "compliance",
    "government_affairs",
    "mail_outbound",
  ]),
  reason: z.string().min(1),
  status: z
    .enum(["required", "requested", "accepted", "completed", "blocked"])
    .default("required"),
  due_date: dateString.optional(),
  work_order_ref: z.string().optional(),
  notes: z.string().optional(),
});

export type FundingHandoff = z.output<typeof fundingHandoffSchema>;
