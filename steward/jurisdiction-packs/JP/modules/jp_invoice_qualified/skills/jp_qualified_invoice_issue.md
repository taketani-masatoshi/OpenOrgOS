# Skill: jp_qualified_invoice_issue（適格請求書発行チェック）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_invoice_qualified/skills/jp_qualified_invoice_issue.md`
**Runtime:** `cli` · **Module:** `jp_invoice_qualified`

## CLI

```bash
npm run orgos -- skills run jp-qualified-invoice-issue
npm run orgos -- operations invoice-qualified check
```

発行要件（登録番号 · 税率表示 · 区分）の前提チェック。請求書 PDF は生成しません。
