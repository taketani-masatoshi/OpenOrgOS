# Compliance Agent 要約 2026-06-25

## 結論

- 有効社内規程 **9 件**: REG-001, REG-002, REG-003, REG-004, REG-005, REG-006, REG-007, REG-008, REG-010
- 保険 CTR draft **0 件** — コンプライアンス P0
- ISO 9001: L2（記録様式整備 · 初回監査未実施）

## KPI / 状態

| 領域 | 状態 |
|------|------|
| 旅館業法 / 許認可 | `docs/company/licenses/` 要確認 |
| 個情 | REG-010 · privacy テンプレ |
| 保険 | CTR-013/014 draft |

## リスク・P0

- B/S TBD — 税務届出ブロッカー（Finance 連携）

## 推奨アクション

1. 保険証券取得 · licenses INDEX 更新
2. `permit_expiry_check` Skill 定期実行

## 根拠

- `regulations.yaml` · `docs/company/regulations/`（有効 REG のみ）
- `docs/compliance/iso/` · `steward/standards/iso/`
- Skill: [steward/core/skills/permit_expiry_check.md](../../../steward/core/skills/permit_expiry_check.md)

*生成: steward dashboard · 2026-06-25T14:18:09.272Z*