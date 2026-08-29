# OTA 運用計画 — PROP-002

**CLI:** `operations hospitality ota-import` · `guest-message render`

## 取込

```bash
orgos operations hospitality ota-import --file export.csv --property PROP-002
```

## メッセージ

- テンプレ: `templates/messages/OTAメッセージテンプレート.md`
- 生成: `guest-message render --template OTAメッセージテンプレート --stay-id STAY-...`
