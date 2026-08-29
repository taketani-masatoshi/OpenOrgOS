import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { mailConfigSchema } from "../../../schemas/correspondence/mail-config.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "./paths.js";
import { ensureMailConfigExample, loadMailConfig } from "./mail-config.js";
import { writeYamlFile } from "../utils.js";
import {
  getGmailOAuthClientConfig,
  getGmailOAuthClientPath,
  getGmailOAuthTokenPath,
  runGmailOAuthCallbackServer,
  saveGmailOAuthClientConfig,
} from "./gmail-oauth.js";

export interface GmailSetupWizardOptions {
  fromEmail?: string;
  fromName?: string;
  nonInteractive?: boolean;
  json?: boolean;
  noOpen?: boolean;
  port?: number;
}

export interface GmailSetupWizardResult {
  ok: boolean;
  mail_config_path: string;
  token_path: string;
  from_email?: string;
  account_email?: string;
  error?: string;
  next_command?: string;
}

async function promptLine(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue || "";
}

async function ensureGmailOAuthClient(opts: GmailSetupWizardOptions): Promise<void> {
  if (getGmailOAuthClientConfig()) return;

  if (opts.nonInteractive) {
    throw new Error(
      "Gmail OAuth client 未設定 — ORGOS_GMAIL_CLIENT_ID/SECRET を設定するか、対話モードで orgos mail setup gmail を実行"
    );
  }

  console.log("");
  console.log("初回のみ: Google Cloud の OAuth クライアント ID / Secret が必要です。");
  console.log("  1. console.cloud.google.com → Gmail API 有効化");
  console.log("  2. 認証情報 → OAuth 2.0 → デスクトップアプリ");
  console.log("  3. リダイレクト URI: http://localhost:8787/oauth/gmail/callback");
  console.log("");

  const clientId = await promptLine("Client ID");
  const clientSecret = await promptLine("Client Secret");
  if (!clientId || !clientSecret) {
    throw new Error("Client ID / Secret は必須です");
  }
  saveGmailOAuthClientConfig({
    version: 1,
    client_id: clientId,
    client_secret: clientSecret,
  });
  console.log(`✓ OAuth client を L2 に保存 (${getGmailOAuthClientPath()})`);
}

export function writeGmailApiMailConfig(opts: {
  fromEmail: string;
  fromName: string;
}): string {
  ensureMailConfigExample();
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  const path = getMailConfigPath();
  const existing = loadMailConfig();
  const raw = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
  const parsed = raw ? (YAML.parse(raw) as Record<string, unknown>) : {};
  const merged = mailConfigSchema.parse({
    ...parsed,
    provider: "gmail_api",
    from: {
      name: opts.fromName,
      email: opts.fromEmail,
    },
    receive: {
      ...(existing?.receive ?? {}),
      sync: "gmail_api",
    },
  });
  writeYamlFile(path, merged);
  return path;
}

export async function runGmailSetupWizard(
  opts: GmailSetupWizardOptions = {}
): Promise<GmailSetupWizardResult> {
  const token_path = getGmailOAuthTokenPath();
  const mail_config_path = getMailConfigPath();

  try {
    await ensureGmailOAuthClient(opts);

    let fromEmail = opts.fromEmail?.trim();
    const fromName = opts.fromName?.trim() ?? "OrgOS Secretary";
    if (!fromEmail && !opts.nonInteractive) {
      fromEmail = await promptLine("送信元 Gmail アドレス", "k.lab.masa@gmail.com");
    }
    if (!fromEmail) {
      throw new Error("--from <email> を指定するか、対話モードで実行してください");
    }

    writeGmailApiMailConfig({ fromEmail, fromName });
    if (!opts.json) {
      console.log(`✓ mail-config 更新: ${mail_config_path} (provider: gmail_api)`);
      console.log("");
      console.log("ブラウザで Gmail 同意を完了してください…");
    }

    const oauth = await runGmailOAuthCallbackServer({
      port: opts.port,
      openBrowser: !opts.noOpen,
    });
    if (!oauth.ok) {
      return {
        ok: false,
        mail_config_path,
        token_path,
        from_email: fromEmail,
        error: oauth.error,
      };
    }

    const accountEmail = oauth.email ?? fromEmail;
    if (oauth.email && oauth.email !== fromEmail) {
      writeGmailApiMailConfig({ fromEmail: oauth.email, fromName });
    }

    return {
      ok: true,
      mail_config_path,
      token_path,
      from_email: accountEmail,
      account_email: oauth.email,
      next_command: "orgos secretary correspondence send --id <DRAFT-ID> --operator-id OP-001",
    };
  } catch (e) {
    return {
      ok: false,
      mail_config_path,
      token_path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
