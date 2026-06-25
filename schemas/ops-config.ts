import { z } from "zod";

export const opsConfigP0ContractSchema = z.object({
  id: z.string(),
  blocker: z.boolean().default(true),
});

export const opsConfigP0SecretsSchema = z.object({
  module_id: z.string(),
  item_id: z.string().optional(),
  label: z.string(),
  blocker: z.boolean().default(true),
  missing_detail: z.string().optional(),
  done_detail: z.string().optional(),
});

export const opsConfigP0RecordsSchema = z.object({
  module_id: z.string(),
  item_id: z.string().optional(),
  label: z.string(),
  probe_file: z.string(),
  blocker: z.boolean().default(false),
  in_progress_detail: z.string().optional(),
  open_detail: z.string().optional(),
});

export const opsConfigP0AuditSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  blocker: z.boolean().default(false),
  done_detail: z.string().optional(),
  open_detail: z.string().optional(),
});

export const opsConfigSchema = z.object({
  skeleton: z.boolean().optional(),
  fiscal_year: z
    .object({
      id: z.string().optional(),
      plan_file: z.string().optional(),
      from: z.string().regex(/^\d{4}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}$/),
    })
    .optional(),
  p0: z
    .object({
      contracts: z.array(opsConfigP0ContractSchema).default([]),
      secrets: z.array(opsConfigP0SecretsSchema).default([]),
      cash_balance: z
        .object({
          enabled: z.boolean().default(true),
          item_id: z.string().default("cash-balance"),
          label: z.string().default("cash-balance.yaml 確定"),
          blocker: z.boolean().default(true),
        })
        .optional(),
      records: z.array(opsConfigP0RecordsSchema).default([]),
      audits: z.array(opsConfigP0AuditSchema).default([]),
    })
    .optional(),
});

export type OpsConfig = z.output<typeof opsConfigSchema>;
export type OpsConfigP0Contract = z.output<typeof opsConfigP0ContractSchema>;
export type OpsConfigP0Secrets = z.output<typeof opsConfigP0SecretsSchema>;
export type OpsConfigP0Records = z.output<typeof opsConfigP0RecordsSchema>;
export type OpsConfigP0Audit = z.output<typeof opsConfigP0AuditSchema>;
