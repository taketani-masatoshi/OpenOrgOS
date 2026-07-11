import { z } from "zod";
import { agentId } from "./classification.js";
import { agentPulseCheckSchema } from "./agent-capability.js";

export const agentClassSchema = z.enum(["operational", "advisor"]);
export const agentActivationSchema = z.enum(["always", "tenant", "developer_explicit"]);
export const agentDispatchModeSchema = z.enum(["consult", "implement"]);
export const agentReadinessProfileSchema = z.enum(["operational", "advisor", "bootstrap"]);

export const agentAccessBoundarySchema = z.object({
  read: z.array(z.string()).default([]),
  write: z.array(z.string()).default([]),
});

export const agentCatalogEntrySchema = z.object({
  id: agentId,
  name: z.string().min(1),
  name_ja: z.string().optional(),
  path: z.string().min(1),
  tier: z.enum(["core", "extension", "advisor"]).default("extension"),
  class: agentClassSchema.default("operational"),
  required: z.boolean().default(false),
  status: z.enum(["active", "catalog", "planned"]).default("active"),
  activation: agentActivationSchema.default("always"),
  dispatch_modes: z.array(agentDispatchModeSchema).default(["consult", "implement"]),
  reports_to: agentId.optional(),
  scope: z.string().default(""),
  binds_modules: z.array(z.string()).default([]),
  access: agentAccessBoundarySchema.default({ read: [], write: [] }),
  capability: z
    .object({
      summary_slug: z.string().min(1),
      data_paths: z.array(z.string()).default([]),
      docs_paths: z.array(z.string()).default([]),
      pulse_checks: z.array(agentPulseCheckSchema).default([]),
    })
    .optional(),
  readiness_profile: agentReadinessProfileSchema.default("operational"),
  auto_route: z.boolean().default(true),
  auto_pulse: z.boolean().default(true),
  implementation_delegate: agentId.optional(),
  architecture_delegate: agentId.optional(),
  production_gate_delegate: agentId.optional(),
});

export const agentCatalogSchema = z.object({
  version: z.number().int().min(3),
  defaults: z
    .object({
      class: agentClassSchema.default("operational"),
      activation: agentActivationSchema.default("always"),
      dispatch_modes: z.array(agentDispatchModeSchema).default(["consult", "implement"]),
      readiness_profile: agentReadinessProfileSchema.default("operational"),
      auto_route: z.boolean().default(true),
      auto_pulse: z.boolean().default(true),
    })
    .default({}),
  aliases: z.record(z.string(), agentId).default({}),
  agents: z.record(z.string(), agentCatalogEntrySchema),
  extensions: z.record(z.string(), z.unknown()).optional(),
  gaps: z.array(z.string()).optional(),
});

export type AgentClass = z.output<typeof agentClassSchema>;
export type AgentActivation = z.output<typeof agentActivationSchema>;
export type AgentDispatchMode = z.output<typeof agentDispatchModeSchema>;
export type AgentReadinessProfile = z.output<typeof agentReadinessProfileSchema>;
export type AgentCatalogEntry = z.output<typeof agentCatalogEntrySchema>;
export type AgentCatalog = z.output<typeof agentCatalogSchema>;
