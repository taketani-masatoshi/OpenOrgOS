import { readFileSync } from "node:fs";
import YAML from "yaml";
import { mailConfigSchema, type MailConfig } from "../../../schemas/correspondence/mail-config.js";

/** Legacy mail-config used `inbox:` — normalize to `receive:` before parse. */
export function normalizeMailConfigYaml(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (obj.inbox != null && obj.receive == null) {
    obj.receive = obj.inbox;
  }
  delete obj.inbox;
  return obj;
}

export function parseMailConfigFile(contents: string): MailConfig {
  const raw = YAML.parse(contents);
  return mailConfigSchema.parse(normalizeMailConfigYaml(raw));
}

export function parseMailConfigObject(raw: unknown): MailConfig {
  return mailConfigSchema.parse(normalizeMailConfigYaml(raw));
}
