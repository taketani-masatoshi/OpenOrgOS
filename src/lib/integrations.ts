import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  integrationsFileSchema,
  type IntegrationsFile,
  type IntegrationWebhook,
} from "../../schemas/integrations.js";
import { readYamlFile, writeYamlFile } from "./utils.js";
import { getTenantDir } from "./utils.js";

export function getIntegrationsDir(): string {
  return join(getTenantDir(), "data", "integrations");
}

export function getIntegrationsPath(): string {
  return join(getIntegrationsDir(), "integrations.yaml");
}

export function getIntegrationsExamplePath(): string {
  return join(getIntegrationsDir(), "integrations.yaml.example");
}

export function loadIntegrations(): IntegrationsFile | null {
  const path = getIntegrationsPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, integrationsFileSchema);
}

export function saveIntegrations(data: IntegrationsFile): IntegrationsFile {
  const parsed = integrationsFileSchema.parse(data);
  mkdirSync(getIntegrationsDir(), { recursive: true });
  writeYamlFile(getIntegrationsPath(), parsed);
  return parsed;
}

export function ensureIntegrationsExample(): string {
  const path = getIntegrationsExamplePath();
  if (existsSync(path)) return path;
  mkdirSync(getIntegrationsDir(), { recursive: true });
  const example = `# Tenant integrations (L2 — copy to integrations.yaml)
# Webhook secrets · setup completion stamp. Mail SMTP config: records/executive/mail-config.yaml
#
version: "1"
setup:
  completed_at: null
  completed_by: null
webhooks:
  - id: secretary_escalate
    url: https://example.com/hooks/secretary
    # secret: set locally only — never commit
notes: |
  Run: orgos tenant setup
  Status: orgos integrations status
`;
  writeFileSync(path, example, "utf-8");
  return path;
}

export function resolveWebhookById(id: string): IntegrationWebhook | undefined {
  const file = loadIntegrations();
  return file?.webhooks.find((w) => w.id === id);
}
