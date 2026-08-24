import { z } from "zod";

export const moduleInviteEnvironmentSchema = z.enum(["test", "production"]);

export const moduleInviteEntrySchema = z.object({
  publisher: z.string().min(1),
  invitee_id: z.string().min(1),
  /** Module ids allowed, or ["*"] for any under that publisher. */
  allowed_modules: z.array(z.string().min(1)).min(1),
  environments: z.array(moduleInviteEnvironmentSchema).default(["test"]),
  expires_on: z.string().optional(),
  notes: z.string().optional(),
});

export const moduleInvitesFileSchema = z.object({
  invites: z.array(moduleInviteEntrySchema).default([]),
  notes: z.string().optional(),
});

export type ModuleInviteEntry = z.output<typeof moduleInviteEntrySchema>;
export type ModuleInvitesFile = z.output<typeof moduleInvitesFileSchema>;
export type ModuleInviteEnvironment = z.output<typeof moduleInviteEnvironmentSchema>;
