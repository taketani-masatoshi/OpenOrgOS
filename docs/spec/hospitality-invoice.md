# 宿泊 invoice generate（hospitality billing parity）

rental と同型の **`steward invoice generate`** · `modules.yaml` **`billing`** ブロック。

## コマンド

```bash
npm run steward -- invoice generate \
  --module hospitality \
  --property PROP-002 \
  --from 2026-02 \
  --to 2026-02 \
  --fy FY2026 \
  --dry-run
```

## modules.yaml billing 例

```yaml
modules:
  - id: hospitality
    enabled: true
    property_ids: [PROP-002]
    billing:
      PROP-002:
        docs_base: docs/finance/accounting/invoices/hospitality
        invoice_number_prefix: STAY
        template_id: hospitality-monthly
        sender_email: info@example.com
        tenant_name: "[ゲスト TBD]"
        tenant_email: "[送付先 TBD]"
        bank_account: "[振込先 TBD]"
```

## モジュール seed

| ファイル | 用途 |
|---------|------|
| `steward/modules/hospitality/seed/invoice-hospitality-monthly.yaml` | PDF/メールテンプレ |
| `steward/modules/hospitality/seed/invoice-hospitality-monthly-body.txt` | メール本文 |
| `operations-public.yaml` | activation seed |
| `operations-*.yaml.example` | テナントコピー用 |

readiness: **production_ready** · `modules check hospitality` で production seed を検証。

## 関連

- [invoice.md](invoice.md)
- [spec-v0.5.md](../spec-v0.5.md)
