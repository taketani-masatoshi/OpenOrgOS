import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import YAML from "yaml";
import { tenantSetupAnswersSchema, type TenantSetupAnswers } from "../../schemas/integrations.js";
import { mailConfigSchema } from "../../schemas/correspondence/mail-config.js";
import { ensureMailConfigExample } from "./correspondence/mail-config.js";
import { ensureMailTriageQueueExample } from "./correspondence/mail-triage-queue.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "./correspondence/paths.js";
import { ensureIntegrationsExample, saveIntegrations } from "./integrations.js";
import { loadOperatorRegistry } from "./org/operators.js";
import { runOperatorInitRegistry } from "../commands/operator-registry.js";
import { getDataDir, currentDate } from "./utils.js";
import { seedExecutiveYamlFromExamples, seedProtocolYamlFromExamples } from "./tenant-scaffold.js";

export interface TenantSetupWizardOptions {
  answers?: TenantSetupAnswers;
  nonInteractive?: boolean;
  operatorId?: string;
}

export interface TenantSetupWizardResult {
  integrations_path: string;
  mail_config_path?: string;
  env_hints: string[];
  executive_seeded: boolean;
  operators_initialized: boolean;
}

async function prompt(
  question: string,
  defaultValue?: string,
  opts?: TenantSetupWizardOptions
): Promise<string> {
  if (opts?.answers || opts?.nonInteractive) {
    return defaultValue ?? "";
  }
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue || "";
}

function seedExecutiveYaml(skip: boolean): boolean {
  if (skip) return false;
  const dataDir = getDataDir();
  const result = { created: [] as string[], skipped: [] as string[] };
  seedExecutiveYamlFromExamples(dataDir, true, result);
  seedProtocolYamlFromExamples(dataDir, true, result);
  return result.created.length > 0;
}

function writeMailConfig(answers: TenantSetupAnswers): string | undefined {
  const provider = answers.mail_provider === "gmail_compose" ? "dry_run" : answers.mail_provider;
  if (!answers.from_email && !answers.from_name) return undefined;

  ensureMailConfigExample();
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  const config = mailConfigSchema.parse({
    provider,
    from: {
      name: answers.from_name ?? "OrgOS Secretary",
      email: answers.from_email ?? "secretary@example.com",
    },
    smtp:
      answers.mail_provider === "smtp" && answers.smtp_host
        ? {
            host: answers.smtp_host,
            port: answers.smtp_port ?? 587,
            secure: answers.smtp_secure ?? false,
          }
        : undefined,
    receive: { sync: "stub" },
    notes:
      answers.mail_provider === "gmail_compose"
        ? "Use orgos secretary mail compose-url for browser send"
        : undefined,
  });
  const path = getMailConfigPath();
  writeFileSync(path, YAML.stringify(config), "utf-8");
  return path;
}

function buildEnvHints(answers: TenantSetupAnswers): string[] {
  const hints: string[] = [];
  if (answers.mail_provider === "smtp") {
    if (answers.smtp_user) hints.push(`export ORGOS_SMTP_USER="${answers.smtp_user}"`);
    if (answers.smtp_password) hints.push(`export ORGOS_SMTP_PASSWORD="***" # set locally`);
    hints.push("export ORGOS_SMTP_HOST=... # if not in mail-config.yaml");
  }
  if (answers.slack_webhook_url) {
    hints.push(`export ORGOS_SLACK_WEBHOOK_URL="${answers.slack_webhook_url}"`);
  }
  hints.push("# Google Calendar: see docs/executive/google-calendar-setup.md · .env");
  return hints;
}

async function resolveAnswers(opts: TenantSetupWizardOptions): Promise<TenantSetupAnswers> {
  if (opts.answers) return tenantSetupAnswersSchema.parse(opts.answers);

  const provider = (await prompt(
    "Mail provider (gmail_compose | smtp | dry_run)",
    "gmail_compose",
    opts
  )) as TenantSetupAnswers["mail_provider"];

  const fromName = await prompt("From display name", "OrgOS Secretary", opts);
  const fromEmail = await prompt("From email address", "", opts);

  const answers: TenantSetupAnswers = {
    mail_provider: provider,
    from_name: fromName || undefined,
    from_email: fromEmail || undefined,
  };

  if (provider === "smtp") {
    answers.smtp_host = (await prompt("SMTP host", "smtp.gmail.com", opts)) || undefined;
    const portStr = await prompt("SMTP port", "587", opts);
    answers.smtp_port = portStr ? parseInt(portStr, 10) : 587;
    answers.smtp_user = (await prompt("SMTP user (stored in env only)", "", opts)) || undefined;
    answers.smtp_password =
      (await prompt("SMTP password (env only — not written to yaml)", "", opts)) || undefined;
  }

  const webhookUrl = await prompt("Webhook URL for secretary_escalate (optional)", "", opts);
  if (webhookUrl) {
    answers.webhook_url = webhookUrl;
    answers.webhook_secret = (await prompt("Webhook secret (optional)", "", opts)) || undefined;
  }

  const slack = await prompt("Slack webhook URL (optional · env)", "", opts);
  if (slack) answers.slack_webhook_url = slack;

  return tenantSetupAnswersSchema.parse(answers);
}

export async function runTenantSetupWizard(
  opts: TenantSetupWizardOptions = {}
): Promise<TenantSetupWizardResult> {
  ensureIntegrationsExample();
  const answers = await resolveAnswers(opts);

  const executiveSeeded = seedExecutiveYaml(Boolean(answers.skip_executive));
  ensureMailTriageQueueExample();

  let operatorsInitialized = Boolean(loadOperatorRegistry()?.operators.length);
  if (!operatorsInitialized && !opts.nonInteractive && !opts.answers) {
    const init = await prompt("Initialize operator registry now? (y/n)", "y", opts);
    if (init.toLowerCase().startsWith("y")) {
      runOperatorInitRegistry({ writeKeys: true });
      operatorsInitialized = true;
    }
  } else if (!operatorsInitialized && opts.answers && !answers.skip_operators) {
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    runOperatorInitRegistry({ writeKeys: false, json: false });
    operatorsInitialized = true;
  }

  const mailPath = writeMailConfig(answers);

  const webhooks = [];
  if (answers.webhook_url) {
    webhooks.push({
      id: "secretary_escalate",
      url: answers.webhook_url,
      secret: answers.webhook_secret,
    });
  }

  const operatorId = opts.operatorId ?? answers.operator_id ?? "setup-wizard";
  saveIntegrations({
    version: "1",
    setup: {
      completed_at: new Date().toISOString(),
      completed_by: operatorId,
      version: "1",
    },
    webhooks,
    notes: `Tenant setup wizard ${currentDate()}`,
  });

  const envHints = buildEnvHints(answers);
  if (answers.smtp_user && answers.smtp_password && !opts.nonInteractive) {
    const envPath = join(process.cwd(), ".env.local-setup-hints");
    const lines = [
      "# Generated by orgos tenant setup — move to .env (gitignored)",
      ...envHints.filter((h) => !h.startsWith("#")),
    ];
    writeFileSync(envPath, lines.join("\n") + "\n", { mode: 0o600 });
    envHints.push(`Wrote hints: ${envPath}`);
  }

  return {
    integrations_path: join(getDataDir(), "integrations", "integrations.yaml"),
    mail_config_path: mailPath,
    env_hints: envHints,
    executive_seeded: executiveSeeded,
    operators_initialized: operatorsInitialized,
  };
}

export function loadTenantSetupAnswersFromFile(path: string): TenantSetupAnswers {
  const raw = readFileSync(path, "utf-8");
  return tenantSetupAnswersSchema.parse(JSON.parse(raw));
}
