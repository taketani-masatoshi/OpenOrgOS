# Skill: jp_foreign_employment_notice（外国人雇用状況届出の期限管理）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_visa_employment/skills/jp_foreign_employment_notice.md`
**Runtime:** `cli` · **Module:** `jp_visa_employment` · **Agent:** Human Resources（proxy）

## CLI

registry は `argv` 方式（`skills run` は deferred · 下記 CLI を直接実行）。

```bash
npm run orgos -- --tenant demo operations foreign-workers notifications --as-of 2026-09-24 --json
```

## 期限（労働施策総合推進法施行規則12条）

| 区分 | 雇入れ | 離職 | 様式 |
|------|--------|------|------|
| 雇用保険被保険者 | 翌月10日まで | 翌日から起算して10日以内 | 資格取得届 / 資格喪失届 |
| 被保険者でない者 | 翌月末日まで | 翌月末日まで | 外国人雇用状況届出書（様式第3号） |

特別永住者 · 外交 · 公用は対象外（同施行規則1条の2）。中長期在留者本人の所属機関等届出（入管法19条の16 · 14日以内）は本人義務 — 会社は案内のみ。

## 手順

1. `notifications` で `pending`（期限前）· `overdue`（超過）· `filed_late`（期限後提出）を確認
2. 人間が在留カード等の原本を確認し、e-Gov · 外国人雇用状況届出システム · ハローワーク窓口で届出
3. 提出日を `hello_work_hire_notified_on` / `hello_work_separation_notified_on` に記録 → `validate`

## 禁止

- 届出様式への在留カード番号等の自動差込 · tracked MD への書き出し
- ハローワーク · e-Gov への自動送信
