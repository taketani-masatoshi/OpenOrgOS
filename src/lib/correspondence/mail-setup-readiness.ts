import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { CorrespondenceChannel } from "../../../schemas/correspondence/draft.js";
import { loadIntegrations } from "../integrations.js";
import { getDataDir } from "../utils.js";
import {
  ensureMailConfigExample,
  loadMailConfig,
  isDryRunSmtpHost,
  resolveMailConfig,
  resolveSmtpCredentials,
  resolveSlackWebhookUrl,
} from "./mail-config.js";
import { getMailConfigPath } from "./paths.js";
import { isGmailOAuthConfigured, loadGmailOAuthToken } from "./gmail-oauth.js";
import { CORRESPONDENCE_CLI } from "./cli-labels.js";

const PLACEHOLDER_FROM_EMAILS = new Set(["secretary@example.com"]);

export class CorrespondenceMailSetupError extends Error {
  readonly issues: MailSetupIssue[];
  readonly guide: string;

  constructor(issues: MailSetupIssue[], guide: string) {
    super(`Mail setup incomplete — ${issues.length} issue(s). Run: orgos ${CORRESPONDENCE_CLI.setupGuide}`);
    this.name = "CorrespondenceMailSetupError";
    this.issues = issues;
    this.guide = guide;
  }
}

export interface MailSetupIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  fix: string;
}

export interface MailSetupReadiness {
  ready: boolean;
  channel: CorrespondenceChannel;
  issues: MailSetupIssue[];
  guide: string;
  from_email?: string;
  provider?: string;
}

function loadCompanyPublicDisclosure(): {
  representative_email?: string;
  contact_email?: string;
} | null {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return null;
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as {
      public_disclosure?: { representative_email?: string; contact_email?: string };
    };
    return doc.public_disclosure ?? null;
  } catch {
    return null;
  }
}

function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (PLACEHOLDER_FROM_EMAILS.has(lower)) return true;
  if (lower.endsWith("@example.com") || lower.endsWith("@example.org")) return true;
  return false;
}

export function collectMailSetupIssues(channel: CorrespondenceChannel): MailSetupIssue[] {
  const issues: MailSetupIssue[] = [];
  const config = resolveMailConfig();
  const fileConfig = loadMailConfig();
  const creds = resolveSmtpCredentials();
  const disclosure = loadCompanyPublicDisclosure();

  if (channel === "email") {
    if (!disclosure?.representative_email) {
      issues.push({
        id: "representative_email",
        severity: "error",
        message: "代表者メールが company.yaml public_disclosure に未登録",
        fix: "data/company.yaml に public_disclosure.representative_email を追加",
      });
    }

    if (!existsSync(getMailConfigPath())) {
      issues.push({
        id: "mail_config_file",
        severity: "error",
        message: "records/executive/mail-config.yaml が未作成",
        fix: "cp records/executive/mail-config.yaml.example records/executive/mail-config.yaml を編集",
      });
    }

    if (isPlaceholderEmail(config.from.email)) {
      issues.push({
        id: "from_placeholder",
        severity: "error",
        message: `送信元がプレースホルダ (${config.from.email})`,
        fix: "mail-config.yaml の from.email を代表メールに設定",
      });
    }

    if (config.provider === "dry_run" && !process.env.ORGOS_SMTP_HOST) {
      issues.push({
        id: "provider_dry_run",
        severity: "error",
        message: "SMTP 未設定（provider=dry_run）",
        fix: "mail-config.yaml で provider: smtp と smtp.host を設定し ORGOS_SMTP_* を投入",
      });
    }

    if (config.provider === "smtp") {
      if (!config.smtp?.host) {
        issues.push({
          id: "smtp_host",
          severity: "error",
          message: "SMTP ホスト未設定",
          fix: "mail-config.yaml の smtp.host に自社 SMTP サーバを記入",
        });
      }
      if (!creds && !isDryRunSmtpHost(config.smtp?.host)) {
        issues.push({
          id: "smtp_credentials",
          severity: "error",
          message: "ORGOS_SMTP_USER / ORGOS_SMTP_PASSWORD 未設定",
          fix: "環境変数または .env（gitignore）に SMTP 認証情報を設定",
        });
      }
    }

    if (config.provider === "gmail_api") {
      const token = loadGmailOAuthToken();
      if (!isGmailOAuthConfigured()) {
        issues.push({
          id: "gmail_oauth_token",
          severity: "error",
          message: "Gmail OAuth トークン未設定",
          fix: "orgos mail setup gmail（Client ID/Secret は対話入力可）",
        });
      } else if (!token?.refresh_token) {
        issues.push({
          id: "gmail_refresh_token",
          severity: "warning",
          message: "Gmail refresh_token なし — 再認可が必要になる可能性",
          fix: "orgos mail setup gmail を再実行",
        });
      }
      if (!process.env.ORGOS_GMAIL_CLIENT_ID?.trim() || !process.env.ORGOS_GMAIL_CLIENT_SECRET?.trim()) {
        issues.push({
          id: "gmail_oauth_env",
          severity: "warning",
          message: "ORGOS_GMAIL_CLIENT_ID / SECRET 未設定（トークン refresh 不可）",
          fix: "GCP OAuth クライアント ID/Secret を環境変数に設定",
        });
      }
    }

    if (
      disclosure?.representative_email &&
      config.from.email &&
      disclosure.representative_email.toLowerCase() !== config.from.email.toLowerCase() &&
      !isPlaceholderEmail(config.from.email)
    ) {
      issues.push({
        id: "from_mismatch",
        severity: "warning",
        message: `送信元 (${config.from.email}) と代表登録 (${disclosure.representative_email}) が不一致`,
        fix: "mail-config.from.email を representative_email と揃える",
      });
    }

    if (!fileConfig && !process.env.ORGOS_SMTP_HOST) {
      // covered by dry_run check
    }
  } else if (channel === "slack") {
    if (!resolveSlackWebhookUrl()) {
      issues.push({
        id: "slack_webhook",
        severity: "error",
        message: "ORGOS_SLACK_WEBHOOK_URL 未設定",
        fix: "Incoming Webhook URL を環境変数に設定（L2 · gitignore 推奨）",
      });
    }
  }

  const integrations = loadIntegrations();
  if (!integrations) {
    issues.push({
      id: "integrations_file",
      severity: "warning",
      message: "data/integrations/integrations.yaml 未作成",
      fix: "orgos tenant setup を実行して統合メタを初期化",
    });
  } else if (!integrations.setup?.completed_at) {
    issues.push({
      id: "setup_completed",
      severity: "warning",
      message: "tenant setup 未完了（setup.completed_at なし）",
      fix: "SMTP 設定後 orgos tenant setup で完了スタンプ",
    });
  }

  return issues;
}

export function buildMailSetupGuide(issues: MailSetupIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const lines = [
    "## 秘書メール初期設定ガイド",
    "",
    "実送信の前に以下を完了してください。未完了のまま送信は行いません（`--dry-run` は EML 出力のみ可）。",
    "",
    "### 手順",
    "",
    "1. **代表メール登録** — `data/company.yaml`",
    "   ```yaml",
    "   public_disclosure:",
    "     representative_email: your-rep@company.co.jp",
    "   ```",
    "",
    "2. **SMTP 設定ファイル** — `records/executive/mail-config.yaml`（L2 · gitignore）",
    "   ```bash",
    "   cp records/executive/mail-config.yaml.example records/executive/mail-config.yaml",
    "   # provider: smtp · from · smtp.host を編集",
    "   ```",
    "",
    "3. **SMTP 認証** — 環境変数（パスワードはコミットしない）",
    "   ```bash",
    "   export ORGOS_SMTP_HOST=smtp.your-company.co.jp",
    "   export ORGOS_SMTP_PORT=587",
    "   export ORGOS_SMTP_USER=your-rep@company.co.jp",
    "   export ORGOS_SMTP_PASSWORD='...'",
    "   export ORGOS_MAIL_FROM=your-rep@company.co.jp",
    "   export ORGOS_MAIL_FROM_NAME='会社名'",
    "   ```",
    "",
    "4. **確認**",
    "   ```bash",
    `   orgos ${CORRESPONDENCE_CLI.config}`,
    `   orgos ${CORRESPONDENCE_CLI.setupGuide}`,
    "   orgos integrations status",
    "   ```",
    "",
    "5. **下書き → 承認 → 送信**",
    "   ```bash",
    `   orgos ${CORRESPONDENCE_CLI.draft} ...`,
    "   orgos org approval approve --id APR-... --reviewed",
    `   orgos ${CORRESPONDENCE_CLI.send} --id DRAFT-...`,
    "   ```",
    "",
  ];

  if (errors.length) {
    lines.push("### 未解決（送信ブロック）", "");
    for (const e of errors) {
      lines.push(`- **${e.id}:** ${e.message} → ${e.fix}`);
    }
    lines.push("");
  }
  if (warnings.length) {
    lines.push("### 警告", "");
    for (const w of warnings) {
      lines.push(`- **${w.id}:** ${w.message} → ${w.fix}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function assessMailSetupReadiness(
  channel: CorrespondenceChannel = "email"
): MailSetupReadiness {
  ensureMailConfigExample();
  const issues = collectMailSetupIssues(channel);
  const errors = issues.filter((i) => i.severity === "error");
  const config = resolveMailConfig();
  return {
    ready: errors.length === 0,
    channel,
    issues,
    guide: buildMailSetupGuide(issues),
    from_email: config.from.email,
    provider: config.provider,
  };
}

/** Throws when real SMTP/Slack send prerequisites are missing. */
export function assertCorrespondenceMailSetupReady(channel: CorrespondenceChannel): MailSetupReadiness {
  const readiness = assessMailSetupReadiness(channel);
  if (readiness.ready) return readiness;
  throw new CorrespondenceMailSetupError(readiness.issues, readiness.guide);
}
