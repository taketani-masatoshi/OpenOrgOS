# OrgOS Ledger — マネージド単一テナント Runbook

**対象:** 運用チーム（OrgOS 側）· パイロット顧客オンボード  
**前提:** 法人 1 社 = 専用 workspace · 電子帳簿保存法対応必須 · e-Tax は別モジュール

---

## 1. プロビジョン（新規顧客）

### A. セルフサインアップ（P1）

1. 顧客が `https://<ledger-host>/signup` から申込
2. Stripe Checkout 完了 → Webhook `POST /chat/v1/product/stripe/webhook`
3. `ORGOS_LEDGER_AUTO_PROVISION=1` 時は自動 provision、否则:

```bash
orgos ledger product activate-signup --signup-id SIGNUP-<tenant-id>
```

### B. 運用チーム手動

```bash
./scripts/provision-ledger-tenant.sh acme-corp "株式会社アクメ" ceo@acme.example business
```

または:

```bash
# 1) テナント雛形
export CUSTOMER_ID=acme-corp   # 英小文字・ハイフン
orgos tenant init "$CUSTOMER_ID" \
  --name "株式会社アクメ" \
  --jurisdiction JP \
  --entity-form kk

# 2) 初期データ（法人 JP パック）
cd "tenants/$CUSTOMER_ID"
# chart-of-accounts · tax-profile · opening-balances をウィザードまたは手入力
orgos validate

# 3) Operator レジストリ（CEO Passkey）
orgos operator init-registry
# CEO が console で Passkey 登録

# 4) 本番環境変数（例）
export ORGOS_TENANT="$CUSTOMER_ID"
export ORGOS_ENV=production
export STEWARD_CHAT_AUTH=1
export ORGOS_COOKIE_SECURE=1
export WIRE_CONSOLE_WEBAUTHN_RP_ID=ledger.acme.example.com
export WIRE_CONSOLE_WEBAUTHN_ORIGIN=https://ledger.acme.example.com
```

## 2. デプロイ（1 顧客 1 コンテナ）

正本: `deploy/product/docker-compose.ledger.yaml`

```bash
cd deploy/product
export ORGOS_TENANT=acme-corp
export LEDGER_HOST=ledger.acme.example.com
docker compose -f docker-compose.ledger.yaml up -d
orgos doctor   # prod_* チェック
curl -fsS "https://${LEDGER_HOST}/chat/v1/health"
```

## 3. 顧客オンボードチェックリスト

- [ ] 会社情報・FY 終了月・opening balances 入力
- [ ] CEO Passkey 登録
- [ ] 経理担当 operator 招待（`operators.yaml`）
- [ ] 電子帳簿検索の動作確認（`orgos ledger dencho search`）
- [ ] 初回月次起票テスト（workbench または CLI）
- [ ] バックアップスケジュール登録（日次 volume snapshot 推奨）

## 4. 日次〜月次（顧客運用）

顧客向け手順は Steward Chat **帳簿**画面を正とする。CLI 代替:

### 経理日次

```bash
# 銀行 CSV 取込（Workbench UI または API）
# → 提案確認 → bulk-exact / 個別承認 → GL 仕訳
orgos validate
```

### 経理月次

```bash
orgos ledger post --source monthly-pl --month YYYY-MM
orgos ledger trial-balance --as-of YYYY-MM-DD
orgos ledger report --prior-year   # 前期比較（Workbench でも可）
orgos ledger period lock --month YYYY-MM
orgos ledger dencho check --json
orgos validate
# Workbench: 月次クローズチェックリスト（未消込銀行・期間ロック・validate）
```

通年デモ（パイロット検証用 · COA 整合あり）:

```bash
ORGOS_TENANT=pilot-ledger-001 orgos ledger product seed-demo-year --force
ORGOS_TENANT=pilot-ledger-001 orgos validate
```

税務 handoff（提出なし）:

```bash
orgos tax package --fiscal-year FY2026
# または Workbench 税務モジュール /?tax=1
```

## 5. バックアップ・リストア

| 対象 | パス | 頻度 |
|------|------|------|
| フリート export | `scripts/backup-ledger-fleet.sh` | 日次 |
| テナント単体 | `orgos ledger product export --tenant-id <id>` | 解約前 |

```bash
# リストア
./scripts/restore-ledger-tenant.sh <tenant-id> <archive.tar.gz> FORCE=1
# または
orgos ledger product restore --tenant-id <id> --archive <path> --force

# 復旧ドリル（product-fleet/restore-drills.yaml に記録）
./scripts/drill-ledger-restore.sh <tenant-id> <archive.tar.gz>
```

リストア後: `orgos validate` · `orgos ledger dencho check`

## 6. 解約

```bash
orgos ledger product offboard --tenant-id <id> --export-first
# 猶予後の完全削除
orgos ledger product offboard --tenant-id <id> --purge --purge-now
# または猶予期間後に cron で
orgos ledger product purge-due
```

1. 最終 export（仕訳 CSV · 試算表 · 勘定内訳）— workbench または `orgos ledger export`
2. 顧客へ ZIP 引き渡し（契約 DPA 猶予期間）
3. `offboard` で subscription cancelled · control-plane 更新

## 7. 関連

- [security-overview.md](security-overview.md)
- [operator-production.md](../operator-production.md)
- [ADR 0058](../adr/0058-orgos-ledger-product-layer.md)
