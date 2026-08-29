import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyOidcIdToken } from "./oidc.js";
import {
  parseCookies,
  registerSession,
  sessionCookieHeader,
  cookieSecureForRequest,
} from "./session.js";
import { wireConsoleAuthMode } from "./mode.js";
import {
  COMMUNITY_LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  isUiLocale,
  localeCookieHeaders,
  uiLocaleFromCommunityCookie,
  type UiLocale,
} from "./locale-cookies.js";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("://") || raw.includes("\\")) return "/";
  return raw;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handoffErrorPage(res: ServerResponse, status: number, message: string): void {
  const body = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"/><title>Console SSO</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1d1d1f}
code{background:#f5f5f7;padding:.1em .35em;border-radius:4px}
a{color:#0071e3}
</style></head><body>
<h1>Operator Console に入れませんでした</h1>
<p>${htmlEscape(message)}</p>
<p>Community の Google ログインと <code>operators.yaml</code> の email / <code>operator_id</code> が紐付いているか、会社ドメイン方針（<code>login_policy</code>）を満たしているか確認してください。</p>
<p><a href="/">予実</a> · <a href="/wire/">Wire</a></p>
</body></html>`;
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

/**
 * GET /auth/community-handoff?token=&next=/
 * Exchange Community-minted OIDC id_token for orgos_wire_session cookie.
 */
export function handleCommunityHandoff(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): boolean {
  if ((req.method ?? "GET") !== "GET") {
    handoffErrorPage(res, 405, "GET のみ対応しています。");
    return true;
  }

  const token = url.searchParams.get("token")?.trim() ?? "";
  const next = safeNextPath(url.searchParams.get("next"));

  if (!token) {
    handoffErrorPage(
      res,
      400,
      "handoff token がありません。My Page の Wire／予実リンクからやり直してください。"
    );
    return true;
  }

  const verified = verifyOidcIdToken(token, { requireRegistry: true });
  if ("error" in verified) {
    const hint =
      verified.error.includes("lifecycle archived")
        ? "テナントは archived 状態のため SSO できません。CEO による復旧が必要です。"
        : verified.error.includes("login_policy")
        ? `${verified.error} — Operator Console の SSO はテナント login_policy.email_domains（または移行中の grandfather_emails）に限られます。`
        : verified.error.includes("not mapped") || verified.error.includes("operators.yaml")
          ? `${verified.error} — テナント data/org/operators.yaml に Google と同じ email を登録するか、Community User.orgosOperatorId を設定してください。`
          : verified.error;
    handoffErrorPage(res, 401, hint);
    return true;
  }

  const mode = wireConsoleAuthMode();
  const { token: sessionToken } = registerSession({
    operator_id: verified.operator_id,
    approver_id: verified.approver_id,
    mode: mode === "prod" ? "prod" : "dev",
  });

  const uiParam = url.searchParams.get("ui_locale");
  const jar = parseCookies(req);
  let uiLocale: UiLocale | null = isUiLocale(uiParam) ? uiParam : null;
  if (!uiLocale) {
    uiLocale =
      uiLocaleFromCommunityCookie(jar[LOCALE_STORAGE_KEY]) ??
      uiLocaleFromCommunityCookie(jar[COMMUNITY_LOCALE_COOKIE]);
  }

  const host = (req.headers.host ?? "localhost").split(":")[0] ?? "localhost";
  const cookies = [sessionCookieHeader(sessionToken, req)];
  if (uiLocale) {
    cookies.push(...localeCookieHeaders(uiLocale, host, cookieSecureForRequest(req)));
  }
  res.setHeader("Set-Cookie", cookies);
  res.writeHead(302, { Location: next });
  res.end();
  return true;
}
