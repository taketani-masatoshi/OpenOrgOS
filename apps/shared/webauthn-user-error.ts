import { WebAuthnRedirectInProgressError } from "./webauthn-page-origin";

export type WebAuthnUserMessageOpts = {
  expectedOrigin?: string;
  rpId?: string;
};

function originHint(opts?: WebAuthnUserMessageOpts): string {
  if (opts?.expectedOrigin) {
    try {
      const u = new URL(opts.expectedOrigin);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return `PassKey は ${u.origin}（localhost）で開いてください。127.0.0.1 は RP ID に使えません`;
      }
      return `PassKey は ${u.origin} で開いてください`;
    } catch {
      /* fall through */
    }
  }
  if (opts?.rpId) {
    return `PassKey は RP ID「${opts.rpId}」と同じホスト名で開いてください`;
  }
  return "PassKey は設定されたコンソール URL で開いてください（127.0.0.1 ではなく localhost）";
}

/** Map WebAuthn / API errors to short Japanese copy (no technical dumps). */
export function webauthnUserMessage(err: unknown, opts?: WebAuthnUserMessageOpts): string {
  if (err instanceof WebAuthnRedirectInProgressError) {
    return "正しい URL に移動しています…";
  }

  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const text = `${name} ${raw}`.toLowerCase();

  if (/bootstrap token required|bootstrap token/i.test(raw)) {
    return "初回登録には bootstrap トークンが必要です。CLI: orgos operator passkey-bootstrap mint";
  }
  if (/invalid.*bootstrap|bootstrap token invalid|expired|already used|must be reserved/i.test(text)) {
    return "bootstrap トークンが無効・期限切れ・使用済みです。新しく mint してください";
  }
  if (/cannot revoke your only login passkey/i.test(raw)) {
    return "本番では最後のログイン PassKey は削除できません。先に bootstrap token を mint してください";
  }
  if (/csrf_origin_mismatch/i.test(raw)) {
    return "操作を完了できませんでした。ページを再読み込みしてもう一度お試しください";
  }
  if (name === "NotAllowedError" || /cancel/i.test(raw)) {
    return "キャンセルしました。もう一度試すときは Bluetooth をオンにしてください";
  }
  if (name === "InvalidStateError" || /already registered|exclude/i.test(text)) {
    return "この端末の PassKey はすでに登録されています";
  }
  if (name === "SecurityError" || /origin mismatch|rpid hash|webauthn origin/i.test(text)) {
    return originHint(opts);
  }
  if (/not available/i.test(text)) {
    return "このブラウザでは PassKey を使えません。Chrome または Safari を使ってください";
  }
  if (/timed out|timeout|abort/i.test(text)) {
    return "時間切れです。Mac と iPhone の Bluetooth をオンにし、近い場所でもう一度";
  }
  if (/bluetooth|hybrid|no authenticator|not found/i.test(text)) {
    return "iPhone が見つかりません。Bluetooth をオンにし、近い場所でもう一度";
  }
  if (/決済 PassKey が未登録|settlement.*未登録/i.test(raw)) {
    return "決済 PassKey が未登録です。先に「iPhone で登録」を完了してください";
  }
  if (/failed to fetch|networkerror|load failed|http 5/i.test(text)) {
    return "コンソールに届きません。接続を確認してください";
  }
  if (/registration disabled/i.test(text)) {
    return "いまは新しい PassKey を登録できません。管理者に許可を依頼してください";
  }
  if (/challenge expired|unknown challenge|store corrupt|credential store unreadable/i.test(text)) {
    return "確認の有効期限が切れたか、サーバー状態に問題があります。ページを再読み込みしてください";
  }
  if (/authenticated session required|session required/i.test(text)) {
    return "Community でログインしてから、PassKey 設定ページで登録してください";
  }
  if (/mismatch|does not belong|unknown operator/i.test(text)) {
    return "確認に失敗しました。サインイン中のオペレーターと一致しているか確認してください";
  }
  if (/unauthorized|401/.test(text)) {
    return "セッションが切れました。Community から再度ログインしてください";
  }
  return raw.length > 120 ? "PassKey の操作に失敗しました。もう一度お試しください" : raw;
}
