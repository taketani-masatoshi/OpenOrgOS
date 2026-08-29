import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";

const supportSchema = z.object({
  version: z.literal(1),
  email: z.string().email(),
  phone: z.string().optional(),
  hours: z.string().optional(),
  escalation_webhook: z.string().url().optional(),
});

export function loadSupportConfig() {
  const path = join(getWorkspaceRoot(), "product-fleet", "support.yaml");
  if (!existsSync(path)) {
    return supportSchema.parse({
      version: 1,
      email: "support@example.com",
      hours: "平日 10:00–18:00 JST",
    });
  }
  return supportSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}
