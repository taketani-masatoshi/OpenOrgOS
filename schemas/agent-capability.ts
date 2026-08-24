import { z } from "zod";
import { agentId } from "./classification.js";
import type { AgentReadinessProfile } from "./agent-catalog.js";
import type { ModuleAgentId } from "./modules.js";

export const agentPulseCheckSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("path_exists"),
    path: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("file_exists"),
    path: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("cli_hint"),
    detail: z.string(),
  }),
  z.object({
    type: z.literal("freshness"),
    path: z.string(),
    max_age_days: z.number().int().positive(),
    detail: z.string().optional(),
  }),
]);

export const agentCapabilityEntrySchema = z.object({
  id: agentId,
  summary_slug: z.string().min(1),
  data_paths: z.array(z.string()).default([]),
  docs_paths: z.array(z.string()).default([]),
  route_ids: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  pulse_checks: z.array(agentPulseCheckSchema).default([]),
});

export const agentCapabilityManifestSchema = z.object({
  version: z.string(),
  agents: z.array(agentCapabilityEntrySchema),
});

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

const agentReadinessTestEvidenceFields = {
  agent_id: agentId,
  test_file: z.string().min(1),
  test_id: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  verified_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  max_age_days: z.number().int().positive().optional(),
  /** SHA-256 of the packaged contract / test file contents. */
  source_sha256: sha256Hex,
  /** Relative path to the execution report JSON. */
  report_file: z.string().min(1),
  /** SHA-256 of the execution report JSON. */
  report_sha256: sha256Hex,
  /** Exact command recorded in the report (must match). */
  command: z.string().min(1),
  /** Git commit recorded when the report was produced. */
  git_commit: z.string().regex(/^[0-9a-f]{7,40}$/i),
};

export const agentReadinessTestEvidenceSchema = z
  .object(agentReadinessTestEvidenceFields)
  .refine((entry) => entry.expires_at != null || entry.max_age_days != null, {
    message: "expires_at or max_age_days is required",
  });

export const agentReadinessEvidenceManifestSchema = z
  .object({
    version: z.string().min(1),
    defaults: z
      .object(agentReadinessTestEvidenceFields)
      .omit({ agent_id: true })
      .partial()
      .optional(),
    evidence: z.array(
      z
        .object(agentReadinessTestEvidenceFields)
        .partial()
        .extend({ agent_id: agentId }),
    ),
  })
  .transform((manifest) => ({
    version: manifest.version,
    evidence: manifest.evidence.map((entry) =>
      agentReadinessTestEvidenceSchema.parse({
        ...manifest.defaults,
        ...entry,
      }),
    ),
  }));

const moduleReadinessTestEvidenceFields = {
  module_id: z.string().min(1),
  test_file: z.string().min(1),
  test_id: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  verified_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  max_age_days: z.number().int().positive().optional(),
  source_sha256: sha256Hex,
  report_file: z.string().min(1),
  report_sha256: sha256Hex,
  command: z.string().min(1),
  git_commit: z.string().regex(/^[0-9a-f]{7,40}$/i),
};

export const moduleReadinessTestEvidenceSchema = z
  .object(moduleReadinessTestEvidenceFields)
  .refine((entry) => entry.expires_at != null || entry.max_age_days != null, {
    message: "expires_at or max_age_days is required",
  });

export const moduleReadinessEvidenceManifestSchema = z
  .object({
    version: z.string().min(1),
    defaults: z
      .object(moduleReadinessTestEvidenceFields)
      .omit({ module_id: true })
      .partial()
      .optional(),
    evidence: z.array(
      z
        .object(moduleReadinessTestEvidenceFields)
        .partial()
        .extend({ module_id: z.string().min(1) }),
    ),
  })
  .transform((manifest) => ({
    version: manifest.version,
    evidence: manifest.evidence.map((entry) =>
      moduleReadinessTestEvidenceSchema.parse({
        ...manifest.defaults,
        ...entry,
      }),
    ),
  }));

export const readinessSkillExecutionSchema = z.object({
  skill_id: z.string().min(1),
  cli_command: z.string().min(1),
  command: z.string().min(1),
  exit_code: z.number().int(),
  stdout_sha256: sha256Hex,
  stdout_excerpt: z.string(),
  output_markers: z.array(z.string()).default([]),
});

export const readinessExecutionReportSchema = z.object({
  kind: z.enum(["agent", "module"]),
  subject_id: z.string().min(1),
  contract_id: z.string().min(1),
  /** Portable primary command (first successful evidence skill). */
  command: z.string().min(1),
  skill_id: z.string().optional(),
  cli_command: z.string().optional(),
  exit_code: z.number().int(),
  stdout_sha256: sha256Hex,
  stdout_excerpt: z.string(),
  verified_at: z.string().datetime(),
  git_commit: z.string().regex(/^[0-9a-f]{7,40}$/i),
  output_markers: z.array(z.string()).default([]),
  /** Per-skill spawn evidence (agents may cover multiple owned CLI skills). */
  skills: z.array(readinessSkillExecutionSchema).optional(),
});

export type AgentCapabilityEntry = z.output<typeof agentCapabilityEntrySchema>;
export type AgentPulseCheck = z.output<typeof agentPulseCheckSchema>;
export type AgentCapabilityManifest = z.output<
  typeof agentCapabilityManifestSchema
>;
export type AgentReadinessTestEvidence = z.output<
  typeof agentReadinessTestEvidenceSchema
>;
export type AgentReadinessEvidenceManifest = z.output<
  typeof agentReadinessEvidenceManifestSchema
>;
export type ModuleReadinessTestEvidence = z.output<
  typeof moduleReadinessTestEvidenceSchema
>;
export type ModuleReadinessEvidenceManifest = z.output<
  typeof moduleReadinessEvidenceManifestSchema
>;
export type ReadinessExecutionReport = z.output<
  typeof readinessExecutionReportSchema
>;

export interface AgentReadinessAxis {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface AgentReadinessResult {
  agent_id: z.output<typeof agentId>;
  name: string;
  profile: AgentReadinessProfile;
  total: number;
  pct: number;
  axes: AgentReadinessAxis[];
  gaps: string[];
}

export interface ModuleAgentReadinessCheck {
  id: string;
  ok: boolean;
  points: number;
  max_points: number;
  detail: string;
}

export interface ModuleAgentReadinessResult {
  module_id: ModuleAgentId;
  proxy_agent: z.output<typeof agentId>;
  tier: "skeleton" | "activation_ready" | "production_ready";
  total: number;
  pct: number;
  axes: AgentReadinessAxis[];
  checks: ModuleAgentReadinessCheck[];
  gaps: string[];
}
