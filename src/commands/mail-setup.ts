/** `mail setup` — Gmail API provider setup (OAuth client · mail-config · token). */
import { runGmailSetupWizard } from "../lib/correspondence/gmail-setup-wizard.js";
import {
  buildGmailAuthorizeUrl,
  completeGmailOAuthWithCode,
  getGmailOAuthTokenPath,
  runGmailOAuthCallbackServer,
} from "../lib/correspondence/gmail-oauth.js";
import { getTenantId } from "../lib/tenant.js";
import {
  buildCommunityMailConnectUrl,
  getCommunityUrl,
  resolveCommunityGmailBindForCli,
} from "../lib/protocol/community-gmail-bind.js";

async function runMailSetupGmailCommunityLink(opts: {
  json?: boolean;
  tenantId?: string;
  communityUrl?: string;
  ttlMinutes?: number;
  expectEmail?: string;
}): Promise<void> {
  const tenantId = opts.tenantId?.trim() || getTenantId();
  const communityUrl = opts.communityUrl?.trim() || getCommunityUrl();
  const issuedForEmails = opts.expectEmail?.trim() ? [opts.expectEmail.trim()] : undefined;

  try {
    const bind = await resolveCommunityGmailBindForCli(tenantId, {
      ttlMinutes: opts.ttlMinutes,
      issuedForEmails,
    });
    const connectUrl = buildCommunityMailConnectUrl(bind.tenant_id, bind.nonce, communityUrl);
    const payload = {
      ok: true,
      tenant_id: bind.tenant_id,
      nonce: bind.nonce,
      expires_at: bind.expires_at,
      remote: bind.remote,
      community_url: communityUrl,
      connect_url: connectUrl,
      hint: "Open the URL in a browser while logged into Community to connect Gmail.",
    };

    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log("Community Gmail 連携 — bind nonce を発行しました。");
    console.log(`  tenant:  ${bind.tenant_id}`);
    console.log(`  expires: ${bind.expires_at}`);
    if (bind.remote) {
      console.log(`  bind:    remote (${process.env.ORGOS_STEWARD_PROTOCOL_URL})`);
    }
    console.log("");
    console.log("Community で Gmail を接続:");
    console.log(connectUrl);
    console.log("");
    console.log("Community ログイン後、上記 URL を開いて Gmail 同意を完了してください。");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

export async function runMailSetupGmail(opts: {
  json?: boolean;
  from?: string;
  name?: string;
  nonInteractive?: boolean;
  noOpen?: boolean;
  port?: number;
  communityLink?: boolean;
  tenantId?: string;
  communityUrl?: string;
  ttlMinutes?: number;
  expectEmail?: string;
}): Promise<void> {
  if (opts.communityLink) {
    await runMailSetupGmailCommunityLink({
      json: opts.json,
      tenantId: opts.tenantId,
      communityUrl: opts.communityUrl,
      ttlMinutes: opts.ttlMinutes,
      expectEmail: opts.expectEmail,
    });
    return;
  }

  const result = await runGmailSetupWizard({
    json: opts.json,
    fromEmail: opts.from,
    fromName: opts.name,
    nonInteractive: opts.nonInteractive,
    noOpen: opts.noOpen,
    port: opts.port,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (!result.ok) {
    console.error(result.error ?? "Gmail setup failed");
    process.exit(1);
  }
  console.log(`✓ Gmail API 初期設定完了`);
  console.log(`  account: ${result.from_email}`);
  console.log(`  token:   ${result.token_path}`);
  console.log(`  config:  ${result.mail_config_path}`);
  console.log("");
  console.log("送信例:");
  console.log(`  ${result.next_command}`);
}

export async function runMailSetupGmailAuth(opts: {
  json?: boolean;
  code?: string;
  listen?: boolean;
  noOpen?: boolean;
  port?: number;
}): Promise<void> {
  const tokenPath = getGmailOAuthTokenPath();

  if (opts.code?.trim()) {
    const result = await completeGmailOAuthWithCode(opts.code.trim());
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }
    if (!result.ok) {
      console.error(result.error ?? "Gmail OAuth failed");
      process.exit(1);
    }
    console.log(`✓ Gmail OAuth token saved: ${tokenPath}`);
    if (result.email) console.log(`  account: ${result.email}`);
    return;
  }

  const authorizeUrl = buildGmailAuthorizeUrl();
  if (!authorizeUrl) {
    const payload = {
      ok: false,
      error: "Set ORGOS_GMAIL_CLIENT_ID and ORGOS_GMAIL_CLIENT_SECRET",
      token_path: tokenPath,
      env: ["ORGOS_GMAIL_CLIENT_ID", "ORGOS_GMAIL_CLIENT_SECRET", "ORGOS_GMAIL_REDIRECT_URI"],
    };
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(payload.error);
    }
    process.exit(1);
  }

  if (opts.listen !== false) {
    if (!opts.json) {
      console.log("Gmail OAuth — waiting for browser consent on localhost…");
      console.log(`Token path: ${tokenPath}`);
      console.log("");
      console.log("If the browser does not open, visit:");
      console.log(authorizeUrl);
      console.log("");
    }
    const result = await runGmailOAuthCallbackServer({
      port: opts.port,
      openBrowser: !opts.noOpen,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }
    if (!result.ok) {
      console.error(result.error ?? "Gmail OAuth failed");
      process.exit(1);
    }
    console.log(`✓ Gmail OAuth token saved: ${tokenPath}`);
    if (result.email) console.log(`  account: ${result.email}`);
    return;
  }

  const payload = {
    ok: true,
    authorize_url: authorizeUrl,
    token_path: tokenPath,
    hint: "Re-run with default (listen) or --code <auth-code> after consent",
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log("Authorize URL:");
  console.log(authorizeUrl);
  console.log(`Token path: ${tokenPath}`);
}
