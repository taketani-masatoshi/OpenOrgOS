# Skill: external_correspondence（社外連絡・対外窓口）

## 目的

社外からの連絡への **一次応答下書き** と、社内 Agent への **ルーティング**。Secretary が社外の主インターフェースとなる Skill。

## 入力

| データ | パス |
|--------|------|
| 社外連絡先 | `cursor/data/executive/external-contacts.yaml` |
| カレンダー（公開可のみ） | `cursor/data/executive/calendar.yaml`（`external_visible: true`） |
| 境界ルール | [13_rules/secretary_steward_boundary.md](../13_rules/secretary_steward_boundary.md) |

## 出力

| 種別 | パス |
|------|------|
| 返信下書き（チャット） | — |
| 下書き保存（任意） | `docs/executive/correspondence-drafts/` |

## 使用 Agent

| Agent | 役割 |
|-------|------|
| **Secretary**（主） | 下書き・日程調整 |
| Executive Steward | 業務依頼のルーティング先 |
| Contract / Finance / Compliance | Secretary からの照会を受ける |

## ルーティングルール

| 依頼内容 | Secretary の動作 |
|---------|-----------------|
| 会食・打合せの日程 | カレンダー確認 → 候補日提示の下書き |
| 会社概要・公開情報 | `company.yaml` の business_description 程度まで |
| 売上・財務・ランウェイ | **断る** → 人間または Steward へ誘導 |
| 契約条件・賃料・保険 | **断る** → Executive → Contract |
| 旅館予約・ゲスト対応 | Hospitality へ委譲（Secretary は日程のみ） |
| 許認可・規程 | Compliance へ委譲 |

## 下書きの必須フッター（社外）

- 契約・金額の確約は含めない
- 「ご確認のうえ、改めてご連絡いたします」等の保留表現
- 送信前に社長（人間）承認が必要である旨を内部メモに記載

## ワークフロー

1. 連絡元を `external-contacts.yaml` と照合（不明なら新規 ID 提案は人間確認後）
2. 依頼タイプを分類（日程 / 情報 / 業務 / 拒否）
3. 拒否・ルート対象は [照会フォーマット](../13_rules/folder_access_policy.md) で Executive へ
4. 下書きを出力（自動送信しない）

## 禁止

- L2 secrets · ゲスト PII の転記
- 財務・契約 YAML の読取
- `external_visible: false` 予定の開示
