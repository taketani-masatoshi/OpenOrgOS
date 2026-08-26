import { defineCopy } from "./define-copy";
import type { UiLocale } from "./locale";

export const WEBAUTHN_COPY = defineCopy(
  {
    redirecting: "正しい URL に移動しています…",
    unsupported: "このブラウザでは PassKey を使えません。Chrome または Safari を使ってください",
    unsupportedPlease: "このブラウザでは PassKey を使えません。Chrome または Safari をご利用ください",
    localhostHint: (origin: string) =>
      `PassKey は ${origin}（localhost）で開いてください。127.0.0.1 は RP ID に使えません`,
    originHint: (origin: string) => `PassKey は ${origin} で開いてください`,
    rpHint: (rpId: string) => `PassKey は RP ID「${rpId}」と同じホスト名で開いてください`,
    defaultOrigin:
      "PassKey は設定されたコンソール URL で開いてください（127.0.0.1 ではなく localhost）",
    bootstrapRequired:
      "初回登録には bootstrap トークンが必要です。CLI: orgos operator passkey-bootstrap mint",
    bootstrapInvalid: "bootstrap トークンが無効・期限切れ・使用済みです。新しく mint してください",
    cannotRevokeOnly:
      "本番では最後のログイン PassKey は削除できません。先に bootstrap token を mint してください",
    csrf: "操作を完了できませんでした。ページを再読み込みしてもう一度お試しください",
    loginCancel: "Touch ID をキャンセルしました。もう一度お試しください",
    settlementCancel: "キャンセルしました。もう一度試すときは Bluetooth をオンにしてください",
    alreadyRegistered: "この端末の PassKey はすでに登録されています",
    timeout: "時間切れです。Mac と iPhone の Bluetooth をオンにし、近い場所でもう一度",
    noIphone: "iPhone が見つかりません。Bluetooth をオンにし、近い場所でもう一度",
    settlementMissing: "決済 PassKey が未登録です。先に「iPhone で登録」を完了してください",
    unreachable: "コンソールに届きません。接続を確認してください",
    registrationDisabled: "いまは新しい PassKey を登録できません。管理者に許可を依頼してください",
    challengeExpired:
      "確認の有効期限が切れたか、サーバー状態に問題があります。ページを再読み込みしてください",
    sessionRequired: "Community でログインしてから、PassKey 設定ページで登録してください",
    mismatch: "確認に失敗しました。サインイン中のオペレーターと一致しているか確認してください",
    unauthorized: "セッションが切れました。Community から再度ログインしてください",
    generic: "PassKey の操作に失敗しました。もう一度お試しください",
  },
  {
    redirecting: "Taking you to the correct URL…",
    unsupported: "PassKeys are not available in this browser. Use Chrome or Safari",
    unsupportedPlease: "PassKeys are not available in this browser. Please use Chrome or Safari",
    localhostHint: (origin: string) =>
      `Open PassKey at ${origin} (localhost). 127.0.0.1 cannot be used as an RP ID`,
    originHint: (origin: string) => `Open PassKey at ${origin}`,
    rpHint: (rpId: string) => `Open PassKey on the same hostname as RP ID “${rpId}”`,
    defaultOrigin: "Open PassKey at the configured console URL (localhost, not 127.0.0.1)",
    bootstrapRequired:
      "First registration needs a bootstrap token. CLI: orgos operator passkey-bootstrap mint",
    bootstrapInvalid: "The bootstrap token is invalid, expired, or already used. Mint a new one",
    cannotRevokeOnly:
      "In production the last login PassKey cannot be removed. Mint a bootstrap token first",
    csrf: "The action could not be completed. Reload the page and try again",
    loginCancel: "Touch ID was cancelled. Please try again",
    settlementCancel: "Cancelled. Turn Bluetooth on before trying again",
    alreadyRegistered: "A PassKey from this device is already registered",
    timeout: "Timed out. Turn on Bluetooth on the Mac and iPhone, stay nearby, and try again",
    noIphone: "iPhone was not found. Turn Bluetooth on, stay nearby, and try again",
    settlementMissing: "No settlement PassKey yet. Finish “Register with iPhone” first",
    unreachable: "Could not reach the console. Check the connection",
    registrationDisabled: "New PassKeys cannot be registered now. Ask an administrator for access",
    challengeExpired: "The challenge expired or the server state is bad. Reload the page",
    sessionRequired: "Sign in to Community first, then register on the PassKey settings page",
    mismatch: "Confirmation failed. Check that it matches the signed-in operator",
    unauthorized: "The session expired. Sign in again from Community",
    generic: "The PassKey action failed. Please try again",
  },
);

export function webauthnCopy(locale: UiLocale) {
  return WEBAUTHN_COPY[locale];
}
