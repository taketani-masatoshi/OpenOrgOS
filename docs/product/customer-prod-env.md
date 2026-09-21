# 顧客別本番 env · MCP token · SMTP drill

**対象:** マネージド単一テナント顧客ごと  
**レイアウト:** [deploy/customers/00-README.md](../../deploy/customers/00-README.md)

## 手順

1. `cp deploy/customers/_template/production.env.example deploy/customers/<id>/production.env`
2. `ORGOS_MCP_TOKEN` · `ORGOS_MAIL_SMTP_URL` · WebAuthn RP を投入（git に入れない）
3. 認証ゲート:
   ```bash
   ./scripts/prod-auth-verify.sh <id>
   ```
4. SMTP drill（outbox に `customer_id` を記録）:
   ```bash
   ./scripts/customer-mail-drill.sh <id> ops@customer.example
   ```
5. 商用ゲート確認:
   ```bash
   ORGOS_ENV=production orgos ledger product readiness --commercial
   ```

`mail-smtp-drill` は `product-fleet/mail-outbox.yaml` の直近 30 日 SMTP 成功を見ます。  
顧客単位で絞る場合は outbox の `customer_id`（または `tenant_id`）が一致する行を使います。
