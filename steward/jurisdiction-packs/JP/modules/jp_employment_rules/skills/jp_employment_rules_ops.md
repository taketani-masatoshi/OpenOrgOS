# Skill: jp_employment_rules（就業規則 · 36協定）

**Module:** `jp_employment_rules` · **Agent:** Human Resources（proxy）
**Path:** `steward/jurisdiction-packs/JP/modules/jp_employment_rules/agent.md`

## Skill

| id | CLI | 用途 |
|----|-----|------|
| `jp_work_rules_draft` | `operations work-rules draft [--kind work-rules\|agreement] [--write]` | 就業規則骨子 · 36協定届 記載項目 MD |
| `jp_36_agreement` | `operations work-rules agreement-check [--as-of YYYY-MM-DD]` | 協定内容 · 届出 · 期限の点検 |

## 手順

1. `seed/sources.yaml.example` の一次資料（e-Gov · 厚生労働省）を確認
2. `workplaces.yaml` に事業場別の常時使用労働者数を登録
3. `operations work-rules validate` → `check` → `agreement-check` → `overtime-check --month YYYY-MM`
4. `draft --write` の MD を人間（社会保険労務士等）がレビューし、様式へ転記して届出

## 判定の扱い

- `violation` — 登録データ上、条文の要件を満たしていない
- `needs_review` — データ不足または業種特例（医師 · 自動車運転 · 災害復旧 · 研究開発）で機械判定しない
- `alert` — 期限間近（運用アラート）

## 禁止

- 法令適合の断定 · 労基署への自動送信 · 個人別労働時間（L2）の tracked 転記
