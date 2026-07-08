# Finance Agent 要約 2026-06-25

## 結論

- **FY2026** 月次売上 ￥0（2026-06 · planned）
- 月次利益（営業近似）-￥50,000 · ネットバーン ￥50,000
- ランウェイ: TBD（cash-balance.yaml 未確定）

## KPI / 状態

| 指標 | 値 |
|------|---:|
| 固定費/月 | ￥0 |
| 変動費/月 | ￥50,000 |
| 損益分岐売上 | — |
| FY2026 純利益（予実） | — |

## リスク・P0

- 現預金残高（cash-balance.yaml — 金額入力待ち）
- 役員貸付返済スケジュール詳細（business-plan TBD）
- 月次実績なし — 計画ベースで算出
- 現預金: cash-balance.yaml テンプレート — 金額入力待ち

## 推奨アクション

1. `cash-balance.yaml` に残高入力 → `status: confirmed` → `npm run validate`
2. 月次 YAML 更新時は `steward deps check` → `validate` → `sync all`

## 根拠

- `data/finance/` · `data/plans/`
- Skill: [steward/core/skills/cashflow_forecast.md](../../../steward/core/skills/cashflow_forecast.md)

*生成: steward dashboard · 2026-06-25T14:59:56.198Z*