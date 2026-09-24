# Skill: jp_labor_contract（雇用契約 · 労働条件通知書 · 無期転換）

**Module:** `jp_labor_contract` · **Agent:** Human Resources（`steward/core/agents/human_resources_agent.md`）
**Path:** `steward/jurisdiction-packs/JP/modules/jp_labor_contract/agent.md`

| Skill id | CLI |
|------|------|
| `jp_employment_contract_draft` | `operations labor-contract draft --contract <id> [--write]` |
| `jp_fixed_term_conversion_check` | `operations labor-contract conversion-check [--as-of YYYY-MM-DD]` |

## 手順

1. `seed/sources.yaml.example` の公表資料（e-Gov · 厚労省）と `minimum-wages.yaml` の `verified_through` を確認
2. `operations labor-contract validate` でデータ整合性を確認
3. `operations labor-contract check --contract <id>` で明示事項 · 契約期間上限 · 試用期間 · 最低賃金を確認
4. `operations labor-contract conversion-check` で通算期間 · 無期転換申込権 · 雇止め予告期限を確認
5. `operations labor-contract draft --contract <id> --write` で通知書ドラフトを生成 → 人間がレビュー · 賃金額と氏名を記入して交付

`needs_review` は自動判定できない論点。人間（人事担当 · 社労士）が判断する。

## 禁止

- 法令適合・雇止めや解雇の有効性の断定
- 賃金額 · 氏名 · 住所等の L2 をチャット · tracked MD へ転記
- 労働者への自動交付 · 行政への自動提出
