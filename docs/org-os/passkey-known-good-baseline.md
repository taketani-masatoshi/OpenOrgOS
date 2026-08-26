# PassKey 既知良好ベースライン（mal · localhost）

**日付:** 2026-08-27  
**用途:** CEO 承認受信箱（`/approvals/`）で iPhone 決済 PassKey 承認が通る状態の記録とロールバック手順。

関連: [passkey-troubleshooting.md](./passkey-troubleshooting.md) · [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)

---

## コード上の正本（ロールバック時にこのコミットへ戻す）

| 領域 | パス |
|------|------|
| Ceremony Router（login=`client-device` / settlement=`hybrid`） | `apps/shared/passkey-ceremony.ts` |
| 決済 `allow_credentials` スコープ | `src/lib/org/settlement-stepup.ts` → `settlementAllowCredentialsForOperator()` |
| 名簿承認者への再バインド | `src/lib/org/operators.ts` → `boundApproverId()` |
| セッション再バインド | `src/lib/wire-console/auth/session.ts` |
| 承認 API | `src/lib/steward-chat/routes/settlement-api.ts` · `wire-approve.ts` |
| CEO 受信箱 UI | `apps/steward-chat/src/ApprovalsQueue.tsx` · `apps/shared/SettlementPasskeyModal.tsx` |

### 検証コマンド（この状態の Definition of Done）

```bash
cd /Users/kk/OS_Steward
npm test -- tests/passkey-ceremony.test.ts tests/passkey-ceremony-client.test.ts tests/settlement-stepup.test.ts
npm run build:package
npm run operator-console:build
npm run passkey:field-check -- --url http://localhost:9470
```

---

## 運用設定（localhost · tenant `mal`）

| 項目 | 値 |
|------|-----|
| Console URL | `http://localhost:9470`（**`127.0.0.1` 不可** — RP は `localhost`） |
| `WIRE_CONSOLE_WEBAUTHN_RP_ID` | `localhost` |
| `WIRE_CONSOLE_WEBAUTHN_ORIGIN` | `http://localhost:9470` |
| `ORGOS_SETTLEMENT_STEPUP` | `1` |
| operator | `OP-001` |
| 名簿 `approver_name` | `段燕燕`（`tenants/mal/data/org/operators.yaml`） |

### 決済 PassKey（2026-08-27 時点 · credential_id のみ）

| purpose | credential_id | approver_id | 備考 |
|---------|---------------|-------------|------|
| **settlement（有効）** | `YNmGaVAyQW95iJcSXHIkBAEtrjg` | 段燕燕 | iPhone hybrid · 承認に使用 |
| settlement（旧・除外対象） | `kcVWJytF6kZXhQCrfvb0td8Sln8` | Demo CEO | `allow_credentials` から除外。設定画面で revoke 推奨 |
| login | `pYolVLt9efx6e-DBxwbFhIVW11c` | Demo CEO | Mac Touch ID |

`settlementAllowCredentialsForOperator()` は **operator_id + 名簿 `approver_name` 一致**の決済鍵のみ返す。Demo CEO 鍵が混ざると「iPhone が見つかりません」になる。

---

## 状態ファイルのスナップショット（設定ロールバック）

正本ディレクトリ: `${ORGOS_WORKSPACE}/.orgos/`（gitignore）

### 保存

```bash
cd /Users/kk/OS_Steward
./scripts/operator-passkey-snapshot.sh --label passkey-known-good
./scripts/operator-passkey-snapshot.sh --list
```

含まれるもの:

- `wire-console-webauthn-credentials.json`
- `settlement-challenges.json` · `webauthn-challenges.json` 等
- `manifest.yaml`（credential_id 一覧 · git ref）
- `env-operator-console.txt`（秘密情報なし）

### 復元

```bash
OPERATOR_PASSKEY_RESTORE_YES=1 ./scripts/operator-passkey-restore.sh latest
# または特定 ID:
OPERATOR_PASSKEY_RESTORE_YES=1 ./scripts/operator-passkey-restore.sh 20260827T154500Z-passkey-known-good
```

復元後:

```bash
cd /Users/kk/OS_Community
docker restart os_community-operator-console-1
curl -s http://localhost:9470/health
```

---

## コードロールバック（git）

PassKey 関連のみ戻す例（コミットハッシュは `git log` で確認）:

```bash
cd /Users/kk/OS_Steward
git log --oneline -- apps/shared/passkey-ceremony.ts src/lib/org/settlement-stepup.ts
# 必要なら:
# git checkout <commit> -- apps/shared/passkey-ceremony.ts src/lib/org/settlement-stepup.ts ...
npm run build:package && npm run operator-console:build
```

Docker は `packages/orgos-cli/dist` と `apps/steward-chat/dist` を volume マウントするため、**イメージ再ビルドなし**で `build:package` + `operator-console:build` + コンテナ再起動で反映できる。

---

## 手動確認チェックリスト

1. `http://localhost:9470` — Touch ID ログイン
2. `http://localhost:9470/approvals/` — `tenant.config` 項目が表示
3. 「承認して適用」→「iPhone で承認を開始」→ ブラウザ QR → iPhone カメラ
4. 承認完了後、キューから項目が消える
