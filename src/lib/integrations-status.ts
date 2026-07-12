import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadIntegrations } from "./integrations.js";
import { loadMailConfig, resolveMailConfig } from "./correspondence/mail-config.js";
import { getMailConfigPath } from "./correspondence/paths.js";
import { loadOperatorRegistry } from "./org/operators.js";
import { getDataDir } from "./utils.js";

export interface IntegrationStatusItem {
  id: string;
  ok: boolean;
  detail: string;
}

export interface IntegrationsStatusReport {
  tenant: string;
  setup_completed: boolean;
  setup_completed_at?: string;
  items: IntegrationStatusItem[];
  score_pct: number;
}

function executiveYamlReady(): boolean {
  const execDir = join(getDataDir(), "executive");
  const required = ["calendar.yaml", "tasks.yaml"];
  return required.every((f) => existsSync(join(execDir, f)));
}

export function computeIntegrationsStatus(tenantId: string): IntegrationsStatusReport {
  const integrations = loadIntegrations();
  const mailFile = loadMailConfig();
  const mailResolved = resolveMailConfig();
  const operators = loadOperatorRegistry();

  const items: IntegrationStatusItem[] = [
    {
      id: "integrations_file",
      ok: Boolean(integrations),
      detail: integrations ? "data/integrations/integrations.yaml" : "missing — run orgos tenant setup",
    },
    {
      id: "setup_completed",
      ok: Boolean(integrations?.setup?.completed_at),
      detail: integrations?.setup?.completed_at ?? "not completed",
    },
    {
      id: "executive_yaml",
      ok: executiveYamlReady(),
      detail: executiveYamlReady()
        ? "data/executive/*.yaml present"
        : "copy data/executive/*.yaml.example",
    },
    {
      id: "mail_config",
      ok: Boolean(mailFile) || mailResolved.provider !== "dry_run",
      detail: existsSync(getMailConfigPath())
        ? `records/executive/mail-config.yaml · provider=${mailResolved.provider}`
        : `env-only · provider=${mailResolved.provider}`,
    },
    {
      id: "smtp_credentials",
      ok:
        mailResolved.provider === "dry_run" ||
        mailResolved.provider === "gmail_api" ||
        Boolean(process.env.ORGOS_SMTP_USER && process.env.ORGOS_SMTP_PASSWORD),
      detail:
        mailResolved.provider === "smtp"
          ? process.env.ORGOS_SMTP_USER
            ? "ORGOS_SMTP_* set"
            : "ORGOS_SMTP_USER/PASSWORD missing"
          : "n/a",
    },
    {
      id: "operators",
      ok: Boolean(operators?.operators.length),
      detail: operators
        ? `${operators.operators.length} operator(s)`
        : "missing — orgos operator init-registry",
    },
    {
      id: "slack_webhook",
      ok: Boolean(process.env.ORGOS_SLACK_WEBHOOK_URL?.trim()),
      detail: process.env.ORGOS_SLACK_WEBHOOK_URL ? "ORGOS_SLACK_WEBHOOK_URL set" : "optional — not set",
    },
  ];

  const required = items.filter((i) => i.id !== "slack_webhook");
  const okCount = required.filter((i) => i.ok).length;
  const score_pct = Math.round((okCount / required.length) * 100);

  return {
    tenant: tenantId,
    setup_completed: Boolean(integrations?.setup?.completed_at),
    setup_completed_at: integrations?.setup?.completed_at ?? undefined,
    items,
    score_pct,
  };
}
