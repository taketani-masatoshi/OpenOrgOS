# Skill: jp_subcontractor_act（取適法 · 中小受託取引の点検）

**Module:** `jp_subcontractor_act` · **Agent:** Procurement · **Path:** `steward/jurisdiction-packs/JP/modules/jp_subcontractor_act/agent.md`

## 手順

1. `seed/sources.yaml.example` の一次資料（e-Gov · 公正取引委員会）で現行ルールを確認
2. `settings.yaml`（自社規模）· `subcontract-parties.yaml`（受託側規模 · `vendor_id` 参照）· `transactions.yaml` を整備
3. `operations subcontract validate` → `scope` → `check --as-of YYYY-MM-DD`
4. 支払遅延・減額がある取引は `late-interest --transaction <id>` で遅延利息を試算
5. `fail` · `needs_review` · `not_assessed` を人間（購買責任者 · 法務）が確認し、是正・記録

## 出力の読み方

| status | 意味 |
|------|------|
| `fail` | データ上ルール違反が検出された |
| `needs_review` | 事実認定・正当理由・旧法適用など人間判断が必要 |
| `not_assessed` | 買いたたき等 — 記録イベントがなくツールでは判定しない |
| `pass` | データ上の問題は検出されなかった（法令適合の保証ではない） |

## 禁止

- 法令適合の断定 · 公正取引委員会 · 中小企業庁への自動報告
- 個人事業者の住所 · 口座 · 個人電話（L2）の tracked 転記
