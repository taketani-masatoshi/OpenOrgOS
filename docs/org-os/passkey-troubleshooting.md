# PassKey トラブルシューティング（Operator Console）

**日付:** 2026-08-22  
**関連:** [passkey-iphone-qr-implementation-plan.md](./passkey-iphone-qr-implementation-plan.md) · [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)

---

## 症状: 「全く動かない」

### 1. 127.0.0.1 を RP ID にしていた（2026-08-22 修正済み）

WebAuthn の RP ID に **IP アドレスは使えない**。ローカル開発の例外は **`localhost` のみ**。

- 参照: [web.dev — RP ID deep dive](https://web.dev/articles/webauthn-rp-id)
- 正しいローカル URL: **`http://localhost:9470`**（`:9471` に逃げた場合はそのポート）
- `http://127.0.0.1:9470` で開いても、コンソールは **`localhost` へリダイレクト**する

環境変数（Docker / ローカル）:

```bash
WIRE_CONSOLE_WEBAUTHN_RP_ID=localhost
WIRE_CONSOLE_WEBAUTHN_ORIGIN=http://localhost:9470
```

RP を変更したら **Mac Touch ID ログイン鍵と iPhone 決済鍵の両方を再登録**する（旧鍵は別 RP に紐づく）。

### 2. operator_id / approver_id が credential と不一致

Wire ログイン画面の ID は、登録時に使った値と一致させる。**登録 API は `operators.yaml` の registry と突合**し、セッションの operator と一致しない ID は拒否します。

| 項目 | 正本 |
|------|------|
| operator_id | `tenants/mal/data/org/operators.yaml`（例: `OP-001`） |
| approver_id | 同ファイルの `approver_name`（例: `段燕燕`） |

### 2.1 登録ゲート（2026-08-22）

| 種別 | 条件 |
|------|------|
| **ログイン PassKey（初回）** | Community SSO セッション必須 → Touch ID 登録（bootstrap 1 回） |
| **ログイン PassKey（追加）** | 既定 OFF（`WIRE_CONSOLE_WEBAUTHN_ALLOW_ADDITIONAL_LOGIN=1` でのみ） |
| **決済 PassKey** | ログイン済みセッション必須 · `operator_id` / `approver_id` がセッションと一致 · ceo/approver ロール |

### 3. settlement_count=0（決済 PassKey 未登録）

ログイン PassKey とは別に **`purpose: settlement`** の登録が必要。

1. `http://localhost:9470` で Touch ID ログイン
2. Steward Chat または Wire で「**iPhone で登録**」
3. Chrome / Safari が出す **ブラウザ標準 QR** を iPhone カメラで読む（Bluetooth オン）

### 4. iPhone hybrid の前提

- Mac と iPhone で **Bluetooth オン**
- 両方 **インターネット接続**（caBLE トンネル）
- iPhone は **approve サイトを開かない** — QR はブラウザ UI のもの
- ローカル hybrid は Mac Chrome / Safari で検証。本番は **公開 HTTPS ドメイン** 必須

### 5. SPA が空（`<html></html>`）

ホスト側 dist が壊れている。復旧:

```bash
cd /Users/kk/OS_Steward
npm run operator-console:build
cd /Users/kk/OS_Community
docker compose -f docker-compose.yml -f docker-compose.operator.yml -f docker-compose.local.yml \
  --profile operator up -d --force-recreate operator-console
```

---

## 確認コマンド

```bash
curl -s http://localhost:9470/chat/v1/auth/config | jq '.webauthn'
# rp_id: "localhost", origin: "http://localhost:9470"
```

```bash
cd /Users/kk/OS_Steward && npm run settlement-passkey:verify -- --url http://localhost:9470
```

---

## credential バックアップ

RP 移行時に `.orgos/wire-console-webauthn-credentials.json` を空にした場合、旧ファイルは  
`.orgos/wire-console-webauthn-credentials.backup-pre-localhost-rp.json` に退避される。
