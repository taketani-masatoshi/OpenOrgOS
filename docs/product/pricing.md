# OrgOS Ledger — 価格（法人向け・公開）

**ステータス:** 公開価格 · 税別 · 変更時は版を上げて通知する

| プラン | 月額 | 対象 | 含む |
|--------|------|------|------|
| **Starter** | ¥29,800 | 法人 · 仕訳 500 件/月まで | GL · 電子帳簿（基本要件）· Workbench · メールサポート |
| **Business** | ¥59,800 | 法人 · 仕訳無制限 · 銀行消込 | Starter + 銀行モジュール · 優先サポート |
| **Accountant** | ¥99,800 | 税理士事務所が複数社管理 | Business + ゲスト閲覧 · 一括 export |

## 共通

- ホスティング: マネージド単一テナント（専用 URL）
- 初期設定: 別途 ¥50,000〜（opening · 科目 · Passkey）
- 電子帳簿の優良要件オプション・e-Tax 申告モジュール: 別見積
- 最低契約: 12 か月
- トライアル: 14 日（プラン共通）

## 課金

- **契約ベース専用**（請求書 · 銀行振込）。セルフサーブの Stripe Checkout は現時点では提供しません
- 申込は招待制。契約締結後に運用チームがテナントをプロビジョンします
- 支払い遅延時は請求書の案内に従い、サポート（`support@oorgos.org`）へ連絡してください
- 対外宣言: [`product-fleet/commercial-declaration.yaml`](../../product-fleet/commercial-declaration.yaml)（`stripe-live` は CEO 判断で除外）
- Stripe を将来オプションとして投入する場合の技術手順: [stripe.md](../../deploy/product/stripe.md)（本番未提供）

## 関連

- [terms-of-service.md](legal/terms-of-service.md)
- [dencho-sales-claim.md](dencho-sales-claim.md)
- [commercial-claim-checklist.md](commercial-claim-checklist.md)
