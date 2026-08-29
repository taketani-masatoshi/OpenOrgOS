# OrgOS Ledger — 顧客 admin（P2）

CEO / 承認者がセルフサービスで行える管理機能。

## UI

Steward Chat → **設定** → **アカウント**（`/?account=1` 直リンクも可）

| 機能 | 権限 |
|------|------|
| プラン・トライアル状態の確認 | 全オペレーター |
| 仕訳件数（当月） | 全オペレーター |
| プラン上限・残数 | 全オペレーター |
| オペレーター一覧 | 全オペレーター |
| オペレーター招待（税理士ゲスト期限付き） | CEO / 承認者 |
| Stripe 請求ポータル | CEO / 承認者 |

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/chat/v1/product/admin` | スナップショット |
| POST | `/chat/v1/product/admin/operators` | 招待（display_name · email · role · guest_expires_at） |
| POST | `/chat/v1/product/admin/billing-portal` | Stripe Customer Portal URL |
| GET | `/chat/v1/product/subscription` | サブスクリプション |

## 招待後の流れ

1. 招待されたメールアドレスを `operators.yaml` に登録
2. 対象者が `/` にアクセスし Passkey を登録
3. 経理担当（`operator`）は帳簿 workbench · 電子帳簿検索を利用

## CLI（運用）

```bash
orgos ledger product subscription
orgos ledger product fleet-status
```

## 関連

- [security-overview.md](security-overview.md)
- [sla.md](sla.md)
