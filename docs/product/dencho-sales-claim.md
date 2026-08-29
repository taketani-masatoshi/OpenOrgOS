# 電子帳簿保存法 — 販売主張の境界（OrgOS Ledger）

**版:** 1.0 · **対象:** 営業・サポート・契約

## 含む（基本要件）

- 仕訳の検索（日付・摘要・金額）
- 訂正・削除の履歴（逆仕訳・監査 trail）
- `validate` による整合性ゲート
- HTTP / CSV エクスポート

## 含まない（別オプションまたは顧客責任）

- **優良電子帳簿**（タイムスタンプ局・スキャナ保存の義務対応）
  - SKU: `dencho-premium-tsa`（`data/product/dencho-premium.yaml` · `orgos` / workbench dencho SKU API）
  - 有効化は `enableDenchoPremium({ provider })` — プロバイダ未接続時は `pending_provider`
- 外部タイムスタンプサービスとの自動連携（基本プラン）
- 紙原本のスキャン保存ワークフロー

## 顧客向け一文（UI / 契約で使用）

> OrgOS Ledger は電子帳簿保存法の**基本要件**（検索・訂正削除履歴・監査）に対応します。優良要件（タイムスタンプ等）は別オプション（`dencho-premium-tsa`）または顧客の運用で対応してください。

## 関連

- [ADR 0058](../../docs/adr/0058-orgos-ledger-product-layer.md)
- [security-overview.md](security-overview.md)
- `src/lib/product/dencho-premium-sku.ts`
