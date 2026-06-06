# 契約書類（人が読むもの）

契約の**本文**は Markdown、**台帳データ**は [`cursor/data/contracts/`](../../cursor/data/contracts/) の YAML です。

## フォルダ構成

```
docs/contracts/
├── README.md           ← 今ここ
└── CTR-{NNN}/
    ├── 01-draft.md     ドラフト（交渉・レビュー用）
    └── 02-executed.md  締結版（署名・締結日を記載した確定版）
```

## ステータスと更新フロー

| status（YAML） | 意味 | 操作 |
|----------------|------|------|
| `draft` | ドラフト作成中・交渉中 | `01-draft.md` を編集 |
| `pending_signature` | 内容確定・署名待ち | `02-executed.md` を確定版に更新 |
| `executed` | 締結済み | `executed_date` を YAML に記録 |
| `terminated` | 終了 | 終了日・理由を YAML に記録 |

1. ドラフト合意 → `02-executed.md` に締結日・署名欄を記入
2. [`cursor/data/contracts/CTR-XXX.yaml`](../../cursor/data/contracts/) の `status` を `executed` に更新
3. [`docs/data/契約管理表.csv`](../data/契約管理表.csv) を同期
4. `npm run validate`

## 契約一覧

| ID | 契約名 | 相手方 | ステータス |
|----|--------|--------|-----------|
| [CTR-001](CTR-001/01-draft.md) | 業務委託契約（竹谷昌敏） | 竹谷昌敏 | executed |

## 参考（Web）

- [フリーランス新法と契約書の明示事項（モノリス法律事務所)](https://monolith.law/corporate/freelance-law-contract)
- [業務委託契約書の書き方（マネーフォワード クラウド契約）](https://biz.moneyforward.com/contract/basic/2188/)
- [フリーランス新法対応ひな形（Collabo Tips）](https://www.collabotips.com/guide/freelance-contract-template/)

※ 本リポジトリの契約書ドラフトは上記を参考にブラッシュアップしたものです。**最終版は弁護士・税理士確認を推奨**します。
