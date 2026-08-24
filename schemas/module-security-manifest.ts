import { z } from "zod";

/**
 * Security section for module manifests (isolation plan M1).
 * Absence of a capability = deny. Not the same as seed/readiness contract fields.
 */

export const moduleStoragePermissionSchema = z.enum(["none", "read", "read_write"]);

export const moduleAiPermissionsSchema = z.object({
  can_observe: z.boolean().default(true),
  can_analyze: z.boolean().default(true),
  can_draft: z.boolean().default(true),
  can_propose: z.boolean().default(false),
  can_approve: z.boolean().default(false),
  can_execute: z.boolean().default(false),
});

export const moduleSecurityLimitsSchema = z.object({
  memory_mb: z.number().int().positive().optional(),
  cpu_seconds: z.number().int().positive().optional(),
  timeout_seconds: z.number().int().positive().optional(),
  concurrent_jobs: z.number().int().positive().optional(),
});

export const moduleSecurityPermissionsSchema = z.object({
  /** Own module-store only — never company SSOT paths. */
  storage_own: moduleStoragePermissionSchema.default("none"),
  /** Gateway read APIs, e.g. vendor.basic */
  data_read: z.array(z.string().min(1)).default([]),
  /** Gateway propose APIs, e.g. payment */
  data_propose: z.array(z.string().min(1)).default([]),
  /** Execute APIs — third-party default empty; hard-denied by policy unless Official */
  data_execute: z.array(z.string().min(1)).default([]),
  /** Relay targets, e.g. secretary */
  agent_relay: z.array(z.string().min(1)).default([]),
  /** Allowed outbound hosts (no scheme). Default deny when empty. */
  network_egress: z.array(z.string().min(1)).default([]),
  /** Named secret use handles (values never returned to module). */
  secrets_use: z.array(z.string().min(1)).default([]),
});

export const moduleSecurityRuntimeSchema = z.enum([
  "in_process_internal",
  "wasi",
  "container",
]);

/**
 * Optional `security:` block on module.manifest.yaml.
 * Catalog Internal modules may omit it (legacy). Invited/third-party must supply it.
 */
export const moduleSecuritySectionSchema = z.object({
  publisher: z.string().min(1).default("openorgos"),
  version: z.string().min(1).optional(),
  runtime: moduleSecurityRuntimeSchema.default("in_process_internal"),
  trust_class: z.enum(["internal", "third_party"]).default("internal"),
  permissions: moduleSecurityPermissionsSchema.default({}),
  limits: moduleSecurityLimitsSchema.optional(),
  ai: moduleAiPermissionsSchema.default({}),
});

export type ModuleSecuritySection = z.output<typeof moduleSecuritySectionSchema>;
export type ModuleSecurityPermissions = z.output<typeof moduleSecurityPermissionsSchema>;
export type ModuleAiPermissions = z.output<typeof moduleAiPermissionsSchema>;

/** Empty default = zero capabilities (default deny). */
export function emptyModuleSecuritySection(
  overrides?: Partial<z.input<typeof moduleSecuritySectionSchema>>
): ModuleSecuritySection {
  return moduleSecuritySectionSchema.parse(overrides ?? {});
}

export function parseModuleSecuritySection(raw: unknown): ModuleSecuritySection {
  return moduleSecuritySectionSchema.parse(raw ?? {});
}
