# OrgOS Ledger — オンボーディングチェックリスト（P2）

顧客 1 社あたりの標準手順。マネージド単一テナント前提。

## 1. 契約・サインアップ

- [ ] プラン確定（Starter / Business / Accountant）
- [ ] `/signup` または `orgos ledger product signup`
- [ ] Stripe Checkout 完了（または ops `provision`）
- [ ] `orgos ledger product activate-signup`（手動時）

## 2. プロビジョン

```bash
./scripts/provision-ledger-tenant.sh <tenant-id> "株式会社…" ceo@example.com business
```

- [ ] `ORGOS_TENANT=<id> orgos validate` 緑
- [ ] CEO Passkey 登録
- [ ] `data/product/subscription.yaml` 状態確認

## 3. 初期設定（CEO / 経理）

- [ ] 会社情報・会計年度（`tenant setup` または YAML）
- [ ] 期首残高 `opening-balances.yaml`
- [ ] 銀行口座（Business 以上）
- [ ] 初回仕訳または import

## 4. 税理士ゲスト（任意）

アカウント画面 → **閲覧のみ** + 期限（例: +3 か月）

- [ ] `guest_expires_at` 設定済み
- [ ] 監査ログでアクセス確認

## 5. 本番起動

```bash
export ORGOS_TENANT=<id>
export LEDGER_DATA=./tenants/<id>
cd deploy/product && docker compose -f docker-compose.ledger.yaml up -d
```

- [ ] `/health` 200
- [ ] Workbench · 電子帳簿検索動作
- [ ] `orgos ledger dencho check` サンプル

## 6. 運用引き渡し

- [ ] SLA 文書共有（[sla.md](sla.md)）
- [ ] バックアップ方針（日次 `backup-ledger-fleet.sh`）
- [ ] サポート連絡先

## 関連

- [managed-single-tenant-runbook.md](managed-single-tenant-runbook.md)
- [customer-admin.md](customer-admin.md)
