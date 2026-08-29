# Skill: jp_women_empowerment_show（行動計画サマリ）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_women_empowerment/skills/women_empowerment_show.md`
**Runtime:** `cli` · **Module:** `jp_women_empowerment` · **Agent:** Compliance

## 目的

女性活躍推進法に基づく一般事業主行動計画の現況を返す — 計画期間 · 宣言種別 · 公表状態 · KPI 数と未設定数 · 施策の進捗 · レビュー周期。

## 入力

- `data/declarations/jp-women-empowerment/declaration.yaml`（未展開時は module seed）
- `data/declarations/jp-women-empowerment/action-plan.yaml`
- `docs/compliance/declarations/women-empowerment.md`（公表文の有無）

## CLI

```bash
npm run orgos -- skills run jp-women-empowerment-show
npm run orgos -- operations women-empowerment show --json
```

## 禁止

従業員個人の属性・評価詳細を要約に含めない。KPI は集計値のみ扱う。
