# jp_corporate_registration — 法務局登記手続 Skill

## 手順

1. `operations corporate procedures` — 手続 ID を確認
2. `case-registry.yaml` に案件（`INC-*` / `CHG-*` / `TERM-*`）を登録
3. `operations corporate validate`
4. `operations corporate checklist --case {id}`
5. `operations corporate draft --case {id} --write`
6. 司法書士 · 代表者が登記ねっとまたは書面で申請

## 設立（incorporation）

`incorporation` ブロックに商号 · 資本金 · 本店 · 目的 · 発起人 · 役員を記載。

## 変更登記

`trade_name_change` · `head_office_change` · `officer_change` 等のブロックを使用。

## 解散

`dissolution` ブロック + 清算手続（税務 · 社保）は別途人間完遂。
