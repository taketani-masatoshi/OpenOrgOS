# Contract Agent 要約 2026-06-26

## 結論

- 契約 **1/2** executed
- **draft 1 件**（P0 保険 0 件）
- 90 日以内期限アラート **0 件**

## KPI / 状態

| ID | 名称 | 状態 | 物件 |
|----|------|------|------|
| CTR-100 | Draft | draft | — |

## リスク・P0

- CTR-100 Draft（draft）

## 推奨アクション

1. draft 契約の締結 · 証券 inbox 归档
2. `npm run orgos -- alerts` で期限確認

## 根拠

- `data/contracts/`
- Skill: [steward/core/skills/contract_expiry_check.md](../../../steward/core/skills/contract_expiry_check.md)

*生成: steward dashboard · 2026-06-26T13:13:07.017Z*