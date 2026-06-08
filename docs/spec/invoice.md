# 請求書生成（invoice generate）

テナントの **`modules.yaml` billing 設定** と **`steward/modules/{id}/seed/` 請求テンプレ** から、賃料請求 PDF · メール文案 · EML/MSG を生成する。

## コマンド

```bash
# 汎用（推奨）
npm run steward -- invoice generate \
  --module rental \
  --property PROP-001 \
  --from 2026-02 \
  --to 2027-01 \
  --fy FY2026

# 従来 alias（rental · PROP-001 想定 · 非推奨）
npm run steward -- invoice bancho --from 2026-02 --to 2027-01 --fy FY2026
```

## modules.yaml billing

物件 ID ごとに出力パス · 請求番号プレフィックス · テンプレ id を指定する。

```yaml
modules:
  - id: rental
    enabled: true
    property_ids: [PROP-001]
    billing:
      PROP-001:
        docs_base: docs/finance/accounting/invoices/bancho
        invoice_number_prefix: BANCHO
        template_id: rent-monthly
        sender_email: info@malkk.com
        tenant_name: "[借主名 TBD]"
        tenant_email: "[送付先メール TBD]"
        bank_account: "[振込先口座 TBD]"
```

| フィールド | 説明 |
|-----------|------|
| `docs_base` | テナント相対。`{docs_base}/{FY}/output/` に PDF/EML |
| `invoice_number_prefix` | 請求番号 `INV-{prefix}-{YYYY-MM}` |
| `template_id` | seed の `invoice-{id}.yaml`（例: `rent-monthly`） |

## モジュール seed テンプレ

| パス | 内容 |
|------|------|
| `steward/modules/rental/seed/invoice-rent-monthly.yaml` | PDF/メール件名パターン |
| `steward/modules/rental/seed/invoice-rent-monthly-body.txt` | メール本文（`{property_name}` 等） |

プレースホルダ: `{year_month}` `{property_name}` `{tenant_name}` `{company_name}` `{monthly_rent}` `{due_date}` `{sender_email}`

## 出力レイアウト例（`billing.docs_base` · FY2026）

```
docs/finance/accounting/invoices/bancho/FY2026/
├── output/   {YYYY-MM}-invoice.pdf · .eml · .msg
└── emails/   {YYYY-MM}-email.md
```

## スキーマ

- `schemas/modules.ts` — `moduleBillingSchema`
- `schemas/invoice-template.ts` — seed YAML 検証

## 関連

- [spec-v0.3.md](../spec-v0.3.md)
- [yojitsu-v2.md](yojitsu-v2.md)
