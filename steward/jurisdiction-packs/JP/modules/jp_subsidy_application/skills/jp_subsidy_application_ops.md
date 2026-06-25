# Skill: jp_subsidy_application（補助金申請執筆支援）

**Module:** `jp_subsidy_application` · **Agent:** Finance（proxy）

## 目的

募集要項に基づき **適格性** · **人件費** · **記載事項ドラフト** を生成する。URL/PDF の読取は Cursor Agent が行い、構造化結果を `data/subsidy/briefs/` に保存する。

## 手順

1. `programs.yaml` に補助金 ID · `source_url` を登録
2. URL / 募集要項 PDF を読み、要件を `briefs/{program-id}.yaml` に反映
3. `npm run steward -- operations subsidy eligibility --program {id}`
4. `personnel-cost-basis.yaml` を HR `employee_id` と突合
5. `npm run steward -- operations subsidy labor-cost --program {id}`
6. `npm run steward -- operations subsidy draft --program {id}` → `docs/subsidy/{id}/` へ人間が清書

## データ境界

| 可（L0–L1） | 禁止（L2/L3） |
|-------------|---------------|
| 法人番号 · 商号 · 代表者 · 従業員数 | 個人給与明細 · マイナンバー |
| 算定用単価（tenant gitignore YAML 可） | 口座番号 · 未公表給与のチャット出力 |

## 関連 REG

REG-004 稟議 · REG-005 経費 — 補助金使途 · 間接費率の社内整合
