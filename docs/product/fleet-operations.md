# OrgOS Ledger — フリート運用（5 社規模 · P2）

マネージド単一テナントを複数顧客で運用する際の OrgOS 側手順。

## Operator Console

フリート運用ダッシュボードは **Web UI にはありません**（旧 `/ops/` は `/` へリダイレクト）。確認は CLI とスクリプトを使います。

```bash
orgos ledger product ops-dashboard   # ORGOS_LEDGER_OPS=1 または CEO
```

**顧客管理**（`/customers/`）とは別物 — 後者は自社の見込み客・既存客ライフサイクル（sales / customer_success モジュール On 時）。

## 日次

```bash
orgos ledger product fleet-health
orgos ledger product fleet-status --product-only | jq '.tenants[] | {tenant_id, plan, subscription_status}'
./scripts/backup-ledger-fleet.sh   # RPO 24h
```

各テナント:

```bash
ORGOS_TENANT=<id> curl -fsS "https://ledger.<customer>/health"
ORGOS_TENANT=<id> orgos validate
```

## 週次

- [ ] バックアップ snapshot 成功（全テナント）
- [ ] `orgos ledger dencho check` サンプリング（1 社以上）
- [ ] Stripe 未払い / `past_due` 確認

## 新規顧客（#4–#5）

```bash
./scripts/provision-ledger-tenant.sh acme-corp "株式会社アクメ" ceo@acme.example business
cd deploy/product
ORGOS_TENANT=acme-corp LEDGER_DATA=../../tenants/acme-corp docker compose -f docker-compose.ledger.yaml up -d
```

セルフサインアップ経由の場合:

1. 顧客が `/signup` から Stripe Checkout
2. Webhook → `ORGOS_LEDGER_AUTO_PROVISION=1` で自動 provision（制御プレーン）
3. 手動の場合: `orgos ledger product activate-signup --signup-id SIGNUP-...`

## インシデント

| 症状 | 手順 |
|------|------|
| 502 | `docker compose` で cloudflared / ledger 再起動（[runbook](managed-single-tenant-runbook.md) §2） |
| validate error | テナント `orgos validate` · 顧客へ修正依頼 |
| 電子帳簿監査 | export CSV + `dencho search` ログ提出 |

## スケール目標（P2）

| 指標 | 目標 |
|------|------|
| 同時運用テナント | 5 社 |
| プロビジョン時間 | 営業日 1 日以内 |
| 顧客 admin 自己招待 | CEO が operator 追加可能 |

## 関連

- [sla.md](sla.md)
- [pricing.md](pricing.md)
