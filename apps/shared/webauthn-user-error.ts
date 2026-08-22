/** Map WebAuthn / API errors to short Japanese copy (no technical dumps). */
export function webauthnUserMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const text = `${name} ${raw}`.toLowerCase();

  if (name === "NotAllowedError" || /cancel/i.test(raw)) {
    return "キャンセルしました。もう一度試すときは Bluetooth をオンにしてください";
  }
  if (name === "InvalidStateError" || /already registered|exclude/i.test(text)) {
    return "この端末の PassKey はすでに登録されています";
  }
  if (name === "SecurityError" || /origin mismatch|rpId hash/i.test(text)) {
    return "PassKey は http://localhost:9470 で開いてください（127.0.0.1 は WebAuthn の RP ID に使えません）";
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
  if (/challenge expired|unknown/i.test(text)) {
    return "確認の有効期限が切れました。もう一度お試しください";
  }
  if (/mismatch/i.test(text)) {
    return "確認に失敗しました。もう一度お試しください";
  }
  return raw;
}
