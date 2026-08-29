# Stripe 環境変数（OrgOS Ledger P1）

| 変数 | 用途 |
|------|------|
| `STRIPE_SECRET_KEY` | Checkout Session 作成 |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証 |
| `STRIPE_PRICE_STARTER` | 任意 · Price ID（未設定時は price_data） |
| `STRIPE_PRICE_BUSINESS` | 同上 |
| `STRIPE_PRICE_ACCOUNTANT` | 同上 |
| `ORGOS_LEDGER_AUTO_PROVISION` | `1` で checkout 完了後に自動 provision |

Compose 例: [`.env.ledger.example`](./.env.ledger.example) · `docker-compose.ledger.yaml` にパススルー済み。

## Webhook エンドポイント

`POST /chat/v1/product/stripe/webhook`

イベント: `checkout.session.completed`

## 本番手順

**推奨（UI）:** Operator Console → `/?account=1` → **Stripe 課金設定** に Secret Key / Webhook Secret を入力して保存。  
→ `data/product/stripe-secrets.env`（gitignore）に書き込まれ、再起動後も有効。

**代替（deploy env）:**

```bash
# 1. Stripe Dashboard で Price / Webhook を作成
# 2. シークレットを環境変数へ（git に書かない）
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export ORGOS_ENV=production

# 3. 状態確認（秘密は表示しない）
orgos ledger product stripe-status

# 4. 認証ファイルのみ書き込み（秘密は含めない）
orgos ledger product stripe-attest
# → product-fleet/stripe-ops.yaml
```

Docker / `production.env` に既にキーがある場合は **env が優先** され、UI 保存分はフォールバックになります。

## 商用 Go-Live チェックリスト

- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` 設定（本番では checkout stub 不可）
- [ ] `orgos ledger product stripe-attest`
- [ ] Webhook イベント: `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.paid|payment_failed`
- [ ] `ORGOS_LEDGER_AUTO_PROVISION=1`（任意）
- [ ] `orgos ledger product readiness --commercial` で未達項目を解消
- [ ] `./scripts/drill-ledger-restore.sh` で復旧ドリル記録
- [ ] `product-fleet/support.yaml` にサポート連絡先
- [ ] 法務: `docs/product/legal/terms-of-service.md`（署名版）を公開

## 開発（stub）

`STRIPE_SECRET_KEY` 未設定時:

- `orgos ledger product signup` が stub URL を返す
- `/signup` UI から同様
- readiness の `stripe-live` は **ops path**（本ドキュメント · env 例 · checkout/webhook）で合格

## 関連

- [pricing.md](../../docs/product/pricing.md)
- [managed-single-tenant-runbook.md](../../docs/product/managed-single-tenant-runbook.md)
