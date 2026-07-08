import { z } from "zod";

export const classificationLevel = z.enum(["L0", "L1", "L2", "L3"]);

export const agentId = z.enum([
  "executive_steward",
  "secretary",
  "finance",
  "contract",
  "property_rental",
  "hospitality",
  "compliance",
  "operations",
  // AI カンパニー拡張（2026-06 · 16 役割モデル）
  "coo",
  "cto",
  "engineering",
  "design_lead",
  "design",
  "sales_lead",
  "sales_outbound",
  "sales_inbound",
  "customer_success",
  "marketing_lead",
  "social_media",
  "personal_finance",
  "legal",
  "security",
  // 一般企業拡張 P0–P2
  "human_resources",
  "corporate_governance",
  "accounting",
  "tax",
  "procurement",
  "government_affairs",
  "intellectual_property",
  "general_affairs",
  "project_management",
  "product_management",
  "recruiting",
  "risk_insurance",
  "data_analytics",
  "devops",
  "investor_relations",
  "esg_sustainability",
  "internal_audit",
  "privacy_officer",
  "treasury",
  "customer_support",
  "pr_communications",
  "learning_development",
  "corporate_development",
  "quality_assurance",
  "medical_device_regulatory",
  "records_audit",
]);

export const aiContextMode = z.enum(["auto", "on_demand", "blocked"]);

export const linkFromSchema = z.object({
  path: z.string().min(1),
  field: z.string().min(1),
  allowed_fields: z.array(z.string()).optional(),
});

export const classifiedResourceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  example_path: z.string().optional(),
  level: classificationLevel,
  git: z.enum(["track", "ignore"]),
  ai_context: aiContextMode.default("auto"),
  cursorignore: z.boolean().optional(),
  description: z.string().optional(),
  read_agents: z.array(agentId).default([]),
  write_agents: z.array(agentId).default([]),
  link_from: z.array(linkFromSchema).optional(),
});

export const classificationRegistrySchema = z.object({
  version: z.string(),
  as_of: z.string().optional(),
  levels: z.record(
    classificationLevel,
    z.object({
      label: z.string(),
      description: z.string(),
      export_allowed: z.union([z.boolean(), z.literal("conditional")]),
    })
  ),
  agents: z.record(
    agentId,
    z.object({
      label: z.string(),
      max_level: classificationLevel,
      output_max_level: classificationLevel.optional(),
    })
  ),
  resources: z.array(classifiedResourceSchema).default([]),
  rules: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
      })
    )
    .optional(),
});

export const bankAccountSchema = z.object({
  id: z.string().regex(/^BANK-\d{3,}$/),
  bank: z.string().min(1),
  bank_code: z.string().optional(),
  branch: z.string().min(1),
  branch_code: z.string().optional(),
  account_type: z.string().min(1),
  account_number: z.string().min(1),
  holder: z.string().min(1),
  purpose: z.string().optional(),
  ib_enabled: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const bankAccountsFileSchema = z.object({
  entity: z.string().min(1),
  as_of: z.string().optional(),
  status: z.enum(["template", "active"]),
  accounts: z.array(bankAccountSchema).default([]),
  notes: z.string().optional(),
});

export type ClassificationLevel = z.output<typeof classificationLevel>;
export type AgentId = z.output<typeof agentId>;
export type ClassificationRegistry = z.output<typeof classificationRegistrySchema>;
export type BankAccountsFile = z.output<typeof bankAccountsFileSchema>;
