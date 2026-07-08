import { z } from "zod";

export const operatorRuntimeKindSchema = z.enum([
  "shell",
  "cursor",
  "cursor_sdk",
  "cursor_cloud",
  "manifest",
]);

export type OperatorRuntimeKind = z.output<typeof operatorRuntimeKindSchema>;

export const shellProfileSchema = z.object({
  command: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
});

export const profileIntegritySchema = z.object({
  shell: z.string().optional(),
  profiles: z.record(z.string()).optional(),
});

export const operatorRuntimeConfigSchema = z.object({
  version: z.string(),
  default_runtime: z.enum(["shell", "cursor", "manifest"]).default("shell"),
  fallback_runtime: z.enum(["shell", "cursor", "manifest"]).default("manifest"),
  shell: shellProfileSchema.optional(),
  profiles: z.record(shellProfileSchema).optional(),
  profile_integrity: profileIntegritySchema.optional(),
  cursor: z
    .object({
      enabled: z.boolean().default(true),
    })
    .optional(),
});

export type OperatorRuntimeConfig = z.output<typeof operatorRuntimeConfigSchema>;
export type ShellProfile = z.output<typeof shellProfileSchema>;

export interface ShellCommandContext {
  promptPath: string;
  workspace: string;
  tenant: string;
  tenantRoot?: string;
}

export interface ResolvedShellCommand {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}
