# 1-on-1 運用ガイド

株式会社MAL 代表（段）と役員・顧問・主要パートナーとの 1-on-1 を Secretary Agent が支援するための運用指針。

---

## 対象

| 区分 | 例 | データ |
|------|-----|--------|
| 社内役員 | 宮城万貴子（共同代表） | `one-on-ones.yaml` · `company.yaml` |
| 顧問 | 税理士（TBD） | `one-on-ones.yaml` · `external-contacts.yaml` |
| 従業員 | 雇用開始後 | `hr/employees.yaml` と ID 紐付け |

現状従業員 0 名のため、役員・顧問を中心に登録する。

---

## 頻度の目安

| cadence | 用途 |
|---------|------|
| monthly | 共同代表との経営方針 |
| quarterly | 顧問・税理士 |
| biweekly | 開業準備期の現場責任者（将来） |
| ad_hoc | 臨時の課題解決 |

---

## 実施フロー

1. **3 日前** — Secretary が `one_on_one_prep` Skill で準備 MD を生成
2. **前日** — 社長が準備 MD を確認し、議題を追記・修正
3. **当日** — 1-on-1 実施。メモは口頭または scratch
4. **当日〜翌日** — Secretary が `one-on-ones.yaml` を更新
   - `last_date` · `next_date`
   - `action_items`（宿題）
   - `topics`（次回用のたたき）

---

## 議題の源泉

- 前回 `action_items` の未完了
- `tasks.yaml` の `category: hr`
- `calendar.yaml` の関連予定
- **経営 P0** は dashboard / executive-remaining-tasks の **見出しのみ**（詳細数値は Steward）

---

## Executive Steward との連携

1-on-1 で財務・契約・許認可の判断が必要な場合:

1. Secretary が準備 MD の「委譲」欄に記載
2. Executive Steward へ [照会フォーマット](../../steward/rules/folder_access_policy.md) で依頼
3. 回答を次回 1-on-1 の議題に反映（数値のコピペは最小限）

---

## 禁止事項

- 相手の個人情報（住所・給与・マイナンバー）をリポジトリに書かない
- 財務 YAML の直接参照・開示
- 1-on-1 内容の社外共有（`external_visible` 予定にも含めない）

---

## 関連

- [weekly-brief-template.md](weekly-brief-template.md)
- [steward/skills/one_on_one_prep.md](../../steward/skills/one_on_one_prep.md)
- [data/executive/one-on-ones.yaml](../../data/executive/one-on-ones.yaml)
