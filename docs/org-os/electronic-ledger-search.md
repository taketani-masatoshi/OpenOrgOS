# 電子帳簿の検索（電帳法・基本要件）

**正本実装:** `src/lib/finance/ledger/electronic-ledger.ts` ·
**BFF:** `GET /chat/v1/ledger/dencho/search` · **CLI:** `orgos ledger dencho search`

電子帳簿保存法の基本要件のうち、**可視性（検索機能）** と **真実性（訂正削除の履歴）** を
GL 上でどう満たしているかを書く。優良要件は対象外（[やらないこと](#やらないこと)）。

## 検索条件

| クエリ | 意味 |
|---|---|
| `from` / `to` | 取引年月日の範囲（YYYY-MM-DD） |
| `min_amount` / `max_amount` | 取引金額の範囲。行の借方・貸方の大きい方で判定 |
| `counterparty` | 取引先 ID（`counterparty_id`） |
| `account` | 勘定科目コード |
| `description` | 摘要の部分一致（大小文字を無視） |
| `entry_id` | 仕訳 ID の直接指定 |
| `limit` | 既定 200 |

日付・金額・取引先の 3 条件は単独でも組み合わせでも指定でき、範囲指定に対応する。
戻り値は `{ count, hits }` で、`hits` は仕訳の**行**単位（`line_index` 付き）。

## 真実性

- 仕訳は追記のみ。既存仕訳の書き換え口は BFF・CLI とも持たない
- 訂正は逆仕訳のみ（`POST /chat/v1/ledger/reverse`）。逆仕訳は `reversal_of` で元仕訳を指す
  （[ADR 0054](../adr/0054-period-lock-reverse-only.md)）
- `posted_at` / `posted_by` を全仕訳に持ち、欠落は整合性レポートで検出する

## 権限

- 検索は `chat:read`。金額・取引先は L1 のため通常のオペレータに開く
- 逆仕訳・月次ロックは `finance:reconcile`。本番モードでは registry の権限で拒否する

## やらないこと

- タイムスタンプ局（優良要件）への送信。別オプションで、現状の実装範囲に含めない
- スキャナ保存の解像度・階調要件。書類イメージは本モジュールの対象外
- 検索結果からの一括ダウンロード（税務調査対応のダウンロード要件は
  `GET /chat/v1/ledger/export` の CSV で代替する）

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/electronic-ledger.test.ts` |
| HTTP | `tests/steward-chat-ledger-http.test.ts` |
| E2E | `e2e/steward-chat.books.spec.ts` |
