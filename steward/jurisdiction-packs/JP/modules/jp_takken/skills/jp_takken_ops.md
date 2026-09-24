# Skill: jp_takken（宅地建物取引業 · 点検 · 報酬上限）

**Module:** `jp_takken` · **Agent:** Compliance（proxy）· **Path:** `steward/jurisdiction-packs/JP/modules/jp_takken/agent.md`

| Skill | コマンド | 用途 |
|-------|---------|------|
| `jp_takken_compliance_check` | `operations takken check [--as-of YYYY-MM-DD] [--json] [--write]` | 取引ごとの 35条（契約前 · 宅建士 · 宅建士証有効）· 37条（交付 · 記名）· 報酬上限 · 事務所の標識・報酬額掲示・帳簿・従業者名簿 |
| `jp_takken_fee_calc` | `operations takken fee --kind sale\|exchange\|lease --price <yen> [--role brokerage\|agency] [--low-cost-vacant] [--residential] [--tax-status taxable\|exempt]` | 報酬告示の上限（税抜の区分計算 · 税込 · 1円未満切捨て） |

## 手順

1. `seed/sources.yaml.example` の一次資料（e-Gov · 国土交通省）を確認
2. `operations takken validate` でデータ整合（事務所 · 宅建士名簿 · 金額の有無）
3. `operations takken license` / `staffing` で免許更新期間 · 変更届出 · 専任宅建士 · 宅建士証を確認
4. 請求前に `operations takken fee` で上限を確認（`--price` は税抜。貸借は借賃1か月分）
5. `operations takken check` の `fail` / `needs_review` を人間が確認し是正

## 判定の読み方

- `ok` — 記録上の問題なし（適法性の保証ではない）
- `warn` — 期限が近い · 期限内の未実施
- `fail` — 記録上の不備 · 期限超過 · 上限超過
- `needs_review` — データ不足（同日の説明 · 合意日未記録 等）または未実装の特例（長期の空家等 · 権利金）

## 禁止

- 点検結果を根拠に適法・請求可と断定 · L2（宅建士・当事者の個人情報）の転記 · 免許権者への自動提出
