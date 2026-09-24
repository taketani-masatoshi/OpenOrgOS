# Skill: jp_patent_deadlines（特許 期限ウォッチ）

**Module:** `jp_patent_application` · **Agent:** Intellectual Property · **runtime:** `cli`
**Path:** `steward/jurisdiction-packs/JP/modules/jp_patent_application/skills/jp_patent_deadlines.md`
**Cursor（任意）:** `@steward/jurisdiction-packs/JP/modules/jp_patent_application/skills/jp_patent_deadlines.md`

## 対象期限

| id | 期限 | 根拠 |
|----|------|------|
| `priority-N` | 優先期間（国内 1年 · パリ 12箇月） | 特許法41条1項1号 · パリ条約4条C |
| `novelty-filing-N` | 公開日から1年以内の出願 | 特許法30条1項・2項 |
| `novelty-certificate-N` | 証明書 — 出願日から30日以内 | 特許法30条3項 |
| `exam-request` | 出願審査請求 — 出願日から3年以内 | 特許法48条の3第1項 |
| `publication` | 出願公開（最先の優先日から1年6月経過 · 目安） | 特許法64条1項 · 36条の2第2項 |
| `first-payment` | 第1〜3年分 — 査定謄本送達日から30日以内 | 特許法108条1項 |
| `annuity` | 第4年以後 — 前年以前（追納6月） | 特許法108条2項 · 112条 |
| `term-expiry` | 存続期間 — 出願日から20年 | 特許法67条1項 |

期間は特許法3条1項で計算し、手続の期限は同条2項により行政機関の休日を翌日へ順延する（`holidays.yaml`）。

## 手順

```bash
npm run orgos -- --tenant demo operations patent deadlines
npm run orgos -- --tenant demo operations patent deadlines --as-of 2026-09-24 --json
```

## status

`upcoming`（31日以上先）· `due`（30日以内）· `overdue` · `done` · `needs_review`（祝日データ範囲外 · 休日順延への依拠 · 回復要件 · 事実不足）

## 禁止

- 期限の最終判断・手続の自動実行 · 割増特許料等の金額算定（未検証のため行わない）
