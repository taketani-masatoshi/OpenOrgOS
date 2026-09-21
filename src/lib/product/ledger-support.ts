import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";

const emptyToUndefined = z.literal("").transform(() => undefined);

const oncallSchema = z
  .object({
    primary: z.string().min(1),
    secondary: z.string().optional(),
    contact: z.string().min(1),
    after_hours: z.string().optional(),
  })
  .optional();

const supportSchema = z.object({
  version: z.literal(1),
  email: z.string().email(),
  phone: z.string().optional(),
  hours: z.string().optional(),
  status_page_url: z.string().min(1).optional(),
  // Empty string in YAML means "not configured" — coerce to undefined so
  // loadSupportConfig never throws on the committed placeholder.
  escalation_webhook: z.string().url().optional().or(emptyToUndefined),
  oncall: oncallSchema,
});

export type SupportConfig = z.infer<typeof supportSchema>;

export function loadSupportConfig(): SupportConfig {
  const path = join(getWorkspaceRoot(), "product-fleet", "support.yaml");
  if (!existsSync(path)) {
    return supportSchema.parse({
      version: 1,
      email: "support@example.com",
      hours: "平日 10:00–18:00 JST",
    });
  }
  const raw = YAML.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  // Normalize blank webhook before parse so zod .url() is never fed "".
  if (typeof raw.escalation_webhook === "string" && !raw.escalation_webhook.trim()) {
    delete raw.escalation_webhook;
  }
  return supportSchema.parse(raw);
}
