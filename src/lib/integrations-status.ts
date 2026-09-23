import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadIntegrations } from "./integrations.js";
import { loadMailConfig, resolveMailConfig } from "./correspondence/mail-config.js";
import { getMailConfigPath } from "./correspondence/paths.js";
import { loadOperatorRegistry } from "./org/operators.js";
import { getDataDir } from "./utils.js";
import { buildConnectorHubSnapshot } from "./integrations/connector-hub.js";
import type { ConnectorProvider } from "../../schemas/connectors.js";

export interface IntegrationStatusItem {
  id: string;
  ok: boolean;
  detail: string;
  /** When false, item is scored. Optional connectors do not lower score_pct. */
  required?: boolean;
}

export interface IntegrationsStatusReport {
  tenant: string;
  setup_completed: boolean;
  setup_completed_at?: string;
  items: IntegrationStatusItem[];
  /** Deterministic next steps for remaining debt (no secrets). */
  next_actions: string[];
  score_pct: number;
}

function executiveYamlReady(): boolean {
  const execDir = join(getDataDir(), "executive");
  const required = ["calendar.yaml", "tasks.yaml"];
  return required.every((f) => existsSync(join(execDir, f)));
}

function connectorItem(
  provider: ConnectorProvider,
  card: ReturnType<typeof buildConnectorHubSnapshot>["connectors"][number],
): IntegrationStatusItem {
  const required = false;
  if (!card.platform_ready) {
    return {
      id: `connector_${provider}`,
      ok: false,
      required,
      detail: card.platform_detail,
    };
  }
  if (card.usable) {
    return {
      id: `connector_${provider}`,
      ok: true,
      required,
      detail: card.connected
        ? `${card.label} connected${card.account_label ? ` · ${card.account_label}` : ""}`
        : `${card.label} fallback configured`,
    };
  }
  return {
    id: `connector_${provider}`,
    ok: false,
    required,
    detail: `${card.label} 未接続 — Console /?integrations=1 または secrets`,
  };
}

export function computeIntegrationsStatus(tenantId: string): IntegrationsStatusReport {
  const integrations = loadIntegrations();
  const mailFile = loadMailConfig();
  const mailResolved = resolveMailConfig();
  const operators = loadOperatorRegistry();
  const hub = buildConnectorHubSnapshot();

  const items: IntegrationStatusItem[] = [
    {
      id: "integrations_file",
      ok: Boolean(integrations),
      required: true,
      detail: integrations ? "data/integrations/integrations.yaml" : "missing — run orgos tenant setup",
    },
    {
      id: "setup_completed",
      ok: Boolean(integrations?.setup?.completed_at),
      required: true,
      detail: integrations?.setup?.completed_at ?? "not completed — orgos tenant setup",
    },
    {
      id: "executive_yaml",
      ok: executiveYamlReady(),
      required: true,
      detail: executiveYamlReady()
        ? "data/executive/*.yaml present"
        : "copy data/executive/calendar.yaml.example → calendar.yaml（tasks も同様）",
    },
    {
      id: "mail_config",
      ok: Boolean(mailFile) || mailResolved.provider !== "dry_run",
      required: true,
      detail: existsSync(getMailConfigPath())
        ? `records/executive/mail-config.yaml · provider=${mailResolved.provider}`
        : `env-only · provider=${mailResolved.provider}（本番は records に mail-config）`,
    },
    {
      id: "smtp_credentials",
      ok:
        mailResolved.provider === "dry_run" ||
        mailResolved.provider === "gmail_api" ||
        Boolean(process.env.ORGOS_SMTP_USER && process.env.ORGOS_SMTP_PASSWORD),
      required: true,
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
      required: true,
      detail: operators
        ? `${operators.operators.length} operator(s)`
        : "missing — orgos operator init-registry",
    },
    ...hub.connectors.map((card) => connectorItem(card.provider, card)),
  ];

  const required = items.filter((i) => i.required !== false);
  const okCount = required.filter((i) => i.ok).length;
  const score_pct = Math.round((okCount / required.length) * 100);

  const next_actions: string[] = [];
  for (const item of items) {
    if (item.ok) continue;
    if (item.id === "integrations_file" || item.id === "setup_completed") {
      next_actions.push("orgos tenant setup");
      continue;
    }
    if (item.id === "executive_yaml") {
      next_actions.push("data/executive の calendar.yaml / tasks.yaml を example から作成");
      continue;
    }
    if (item.id === "mail_config") {
      next_actions.push("mail-config を records に置き、dry_run 以外へ");
      continue;
    }
    if (item.id.startsWith("connector_")) {
      next_actions.push(`${item.detail}`);
    }
  }

  return {
    tenant: tenantId,
    setup_completed: Boolean(integrations?.setup?.completed_at),
    setup_completed_at: integrations?.setup?.completed_at ?? undefined,
    items,
    next_actions: [...new Set(next_actions)],
    score_pct,
  };
}
