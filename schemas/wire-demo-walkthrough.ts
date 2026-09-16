/**
 * Wire Demo Walkthrough — MAL ↔ Southwood one-path guide (L1).
 * ADR: docs/adr/0075-wire-demo-walkthrough.md
 */
import { z } from "zod";

export const wireDemoStepStatusSchema = z.enum([
  "ready",
  "pending",
  "missing",
  "info",
]);

export const wireDemoStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  status: wireDemoStepStatusSchema,
  href: z.string().optional(),
  detail: z.string().optional(),
});

export const wireDemoPeerSchema = z.object({
  peer_id: z.string(),
  display_name: z.string(),
  org_uri: z.string().optional(),
  has_delivery_path: z.boolean(),
});

export const wireDemoWalkthroughSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  report_date: z.string(),
  story_title: z.string(),
  story_lead: z.string(),
  counterparty: z.string(),
  peers: z.array(wireDemoPeerSchema),
  steps: z.array(wireDemoStepSchema),
  wire_pending_count: z.number().int().nonnegative(),
  approvals_pending_count: z.number().int().nonnegative(),
  cli_hint: z.string(),
  wire_console_href: z.string(),
  approvals_href: z.string(),
});

export type WireDemoWalkthrough = z.infer<typeof wireDemoWalkthroughSchema>;
export type WireDemoStep = z.infer<typeof wireDemoStepSchema>;
